/** The five seed customers, as the sign-in page offers them. Emails aren't here - the server action reads them from the customers table. */
export const SAMPLE_CUSTOMERS = [
  { customerId: "CUS-1001", name: "Amara Okafor", company: "LagosLedger", status: "Active", tone: "success" },
  { customerId: "CUS-1002", name: "Daniel Mwangi", company: "NairobiOps", status: "Pending verification", tone: "warning" },
  { customerId: "CUS-1003", name: "Efua Mensah", company: "AccraStack", status: "Restricted", tone: "danger" },
  { customerId: "CUS-1004", name: "Amina Jacobs", company: "CapeCloud", status: "Active", tone: "success" },
  { customerId: "CUS-1005", name: "Patrick Ndayisaba", company: "KigaliWorks", status: "Active", tone: "success" },
] as const;

export type SampleCustomerId = (typeof SAMPLE_CUSTOMERS)[number]["customerId"];

export function isSampleCustomerId(value: string): value is SampleCustomerId {
  return SAMPLE_CUSTOMERS.some((c) => c.customerId === value);
}
