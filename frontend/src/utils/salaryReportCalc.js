function slipMonthKey(slip) {
  if (slip.monthKey) return slip.monthKey;
  return `${slip.periodYear}-${String(slip.periodMonth).padStart(2, "0")}`;
}

export function buildSalaryReportData(slips, fromMonth, toMonth) {
  if (!fromMonth || !toMonth || toMonth < fromMonth) return null;

  const selectedSlips = slips
    .filter((slip) => {
      const key = slipMonthKey(slip);
      return key >= fromMonth && key <= toMonth;
    })
    .sort((a, b) => slipMonthKey(a).localeCompare(slipMonthKey(b)));
  const employeeMap = new Map();

  selectedSlips.forEach((slip) => {
    const employeeId = slip.dispatcherId;
    const accountAmount = Number(slip.accountAmount) || 0;
    const cashAmount = Number(slip.cashAmount) || 0;
    const taxDeducted = Number(slip.incomeTax) || 0;
    const netPay =
      slip.netPay == null
        ? accountAmount + cashAmount
        : Number(slip.netPay) || 0;
    const salaryEarned =
      slip.totalEarnings == null
        ? netPay +
          (slip.totalDeductions == null
            ? taxDeducted
            : Number(slip.totalDeductions) || 0)
        : Number(slip.totalEarnings) || 0;
    const employee = employeeMap.get(employeeId) || {
      dispatcherId: employeeId,
      dispatcherName: slip.dispatcherName,
      cnic: slip.cnic || "",
      designation:
        slip.designation ||
        (slip.employeeType === "employee" ? "Employee" : "Dispatcher"),
      totalSalary: 0,
      salaryInAccount: 0,
      salaryInCash: 0,
      taxDeducted: 0,
    };

    employee.dispatcherName = slip.dispatcherName || employee.dispatcherName;
    employee.cnic = slip.cnic || employee.cnic;
    employee.designation = slip.designation || employee.designation;
    employee.totalSalary += salaryEarned;
    employee.salaryInAccount += accountAmount;
    employee.salaryInCash += cashAmount;
    employee.taxDeducted += taxDeducted;
    employeeMap.set(employeeId, employee);
  });

  const rows = [...employeeMap.values()].sort((a, b) =>
    a.dispatcherName.localeCompare(b.dispatcherName),
  );
  const totals = rows.reduce(
    (sum, row) => ({
      totalSalary: sum.totalSalary + row.totalSalary,
      salaryInAccount: sum.salaryInAccount + row.salaryInAccount,
      salaryInCash: sum.salaryInCash + row.salaryInCash,
      taxDeducted: sum.taxDeducted + row.taxDeducted,
    }),
    { totalSalary: 0, salaryInAccount: 0, salaryInCash: 0, taxDeducted: 0 },
  );

  return {
    rows,
    totals,
    includedMonths: [...new Set(selectedSlips.map(slipMonthKey))].sort(),
  };
}
