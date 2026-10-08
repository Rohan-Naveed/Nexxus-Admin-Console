const nodemailer = require("nodemailer");

// ====== EDIT THESE ======
const SMTP_PASS = "nexxus2026@";
const MAIL_TO = "agenthanir2999@gmail.com";
// ========================

const SMTP_HOST = "mail.nexxusdispatch.com";
const SMTP_PORT = 465;
const SMTP_USER = "accounts@nexxusdispatch.com";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true, // SSL/TLS on port 465
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  logger: true,
  debug: true,
});

async function main() {
  // Step 1: check connection + login without sending anything
  await transporter.verify();
  console.log("SMTP connection and login OK");

  // Step 2: send a test email
  const info = await transporter.sendMail({
    from: `"Dispatch System" <${SMTP_USER}>`,
    to: MAIL_TO,
    subject: "Test email from Node.js",
    text: "This is a test email sent via SMTP SSL on port 465.",
  });

  console.log("Email sent:", info.messageId);
  console.log("Accepted:", info.accepted, "Rejected:", info.rejected);
}

main().catch((err) => {
  console.error("Failed:", err.code, err.message);
});
