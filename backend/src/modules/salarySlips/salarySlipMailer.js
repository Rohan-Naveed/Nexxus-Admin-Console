const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const config = require("../../../config/config.json");
const { ApiError } = require("../../middleware/errorHandler");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function getLogoAttachment() {
  const relativePath = config.mail?.salarySlipLogoPath;
  if (!relativePath) return null;
  const logoPath = path.resolve(__dirname, "../../../", relativePath);
  if (!fs.existsSync(logoPath)) return null;

  const extension = path.extname(logoPath).toLowerCase();
  const contentType =
    extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".gif"
        ? "image/gif"
        : extension === ".png"
          ? "image/png"
          : null;
  if (!contentType) return null;

  return {
    filename: path.basename(logoPath),
    path: logoPath,
    cid: "nexxus-salary-logo",
    contentType,
  };
}

function buildSalarySlipEmailHtml({
  dispatcherName,
  periodLabel,
  contactUrl,
  hasLogo,
}) {
  const safeName = escapeHtml(dispatcherName);
  const safePeriod = escapeHtml(periodLabel);
  const logo = hasLogo
    ? '<img src="cid:nexxus-salary-logo" alt="Nexxus Logistics" width="190" style="display:block;width:190px;max-width:100%;height:auto;margin:0 auto;border:0;" />'
    : '<div style="font-family:Arial,sans-serif;font-size:24px;font-weight:bold;letter-spacing:1px;color:#66713d;">NEXXUS LOGISTICS</div>';

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px 8px;background:#f0f1f4;font-family:Arial,Helvetica,sans-serif;color:#424242;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-collapse:collapse;">
    <tr><td style="padding:18px 18px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#626e3b;border:3px solid #111111;">
        <tr><td align="center" style="padding:25px 18px;text-align:center;">
          <span style="display:block;max-width:340px;margin:0 auto;padding:8px 18px;border-radius:24px;background:#ffdb35;color:#5d6737;font-size:20px;font-weight:bold;">Salary Slip</span>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:12px 20px 0;text-align:center;">${logo}</td></tr>
    <tr><td align="center" style="padding:14px 22px 4px;text-align:center;">
      <h1 style="display:inline;margin:0;background:#ffe348;color:#65703a;font-size:25px;line-height:1.35;font-weight:bold;">Your Salary Slip is Ready!</h1>
    </td></tr>
    <tr><td style="padding:5px 28px 0;text-align:center;font-size:16px;line-height:1.65;">
      <p style="margin:0 0 12px;">Dear ${safeName},</p>
      <p style="margin:0 0 12px;">We hope this message finds you well. Please find your salary slip for <strong>${safePeriod}</strong> attached to this email. The document provides a summary of your compensation and deductions for this pay cycle.</p>
      <p style="margin:0 0 14px;">Your salary has been processed. Please allow 1–2 business days for the account transfer to reflect in your bank.</p>
    </td></tr>
    <tr><td style="padding:0 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#68743f;border:2px solid #111111;border-radius:7px;color:#f8f4dc;">
        <tr><td width="44" align="center" style="border-right:1px solid #252b17;padding:12px 5px;color:#ffdf34;font-size:28px;font-weight:bold;">i</td>
        <td style="padding:14px 16px;text-align:center;font-size:14px;line-height:1.6;">Please review the attached document at your earliest convenience. If you notice any discrepancies or have questions, contact our Accounts Team so we can assist you.</td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:12px 28px 0;text-align:center;font-size:14px;line-height:1.6;font-style:italic;">We deeply value your contribution and dedication to the team. Thank you for your continued hard work and commitment.</td></tr>
    <tr><td align="center" style="padding:12px 20px 14px;text-align:center;">
      <a href="${escapeHtml(contactUrl)}" style="display:inline-block;padding:9px 25px;border:2px solid #f0d134;border-radius:24px;background:#626e3b;color:#ffffff;text-decoration:none;font-family:Georgia,serif;font-size:16px;font-weight:bold;">Contact Us</a>
    </td></tr>
    <tr><td style="padding:0 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#626e3b;border:3px solid #111111;color:#ffffff;">
        <tr><td style="padding:13px 12px;text-align:center;font-size:12px;line-height:1.5;">This email is confidential and intended solely for the named recipient. If you received it in error, please notify us and delete it immediately. &copy; 2026 Nexxus Logistics. All rights reserved.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function createTransporter() {
  const smtp = config.mail?.smtp;
  if (!smtp?.password?.trim()) {
    throw new ApiError(
      503,
      "Salary email is not configured. Set mail.smtp.password in backend/config/config.json.",
    );
  }
  const port = Number(smtp.port);
  if (
    !smtp.host ||
    !smtp.user ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new ApiError(
      503,
      "Salary email SMTP settings are invalid in backend/config/config.json.",
    );
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port,
    secure: typeof smtp.secure === "boolean" ? smtp.secure : port === 465,
    auth: { user: smtp.user, pass: smtp.password },
  });
}

async function sendSalarySlipEmail({
  to,
  dispatcherName,
  periodLabel,
  pdfBuffer,
  filename,
}) {
  const transporter = createTransporter();
  const smtp = config.mail.smtp;
  const fromName = smtp.fromName || "Dispatch System";
  const logoAttachment = getLogoAttachment();
  const contactUrl =
    config.mail.salarySlipContactUrl || "https://wa.me/923143981996";

  await transporter.sendMail({
    from: `"${fromName}" <${smtp.user}>`,
    to,
    cc: "raahimabid4@gmail.com",
    subject: `Salary slip - ${periodLabel}`,
    text: `Dear ${dispatcherName},\n\nPlease find your salary slip for ${periodLabel} attached.\n\nRegards,\nNexxus Logistics`,
    html: buildSalarySlipEmailHtml({
      dispatcherName,
      periodLabel,
      contactUrl,
      hasLogo: Boolean(logoAttachment),
    }),
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
      ...(logoAttachment ? [logoAttachment] : []),
    ],
  });
}

module.exports = { buildSalarySlipEmailHtml, sendSalarySlipEmail };
