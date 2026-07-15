// Tokens contain only opaque internal ids and a cart hash. They never include the
// retailer account, customer data, payment details, or Browserbase credentials.
export function purchaseApprovalToken(jobId: string, hash: string): string {
  return `purchase-approval:${jobId}:${hash}`;
}
