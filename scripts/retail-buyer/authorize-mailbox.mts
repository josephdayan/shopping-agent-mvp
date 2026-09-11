import { execFileSync } from "node:child_process";
import { authorizeGmailMailbox } from "./gmail-oauth";

function secret(name: string, service: string) {
  if (process.env[name]?.trim()) return process.env[name]!.trim();
  try {
    return execFileSync(
      "security",
      [
        "find-generic-password",
        "-a",
        "lia-purchase-worker",
        "-s",
        service,
        "-w",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return undefined;
  }
}

const clientId = secret("LIA_GMAIL_CLIENT_ID", "Lia Gmail Client ID");
const clientSecret = secret(
  "LIA_GMAIL_CLIENT_SECRET",
  "Lia Gmail Client Secret",
);
if (!clientId || !clientSecret)
  throw new Error(
    "Guarde primeiro o client ID e o client secret nos serviços correspondentes do Chaves.",
  );

await authorizeGmailMailbox({
  clientId,
  clientSecret,
  announce(url) {
    console.log("Abra a URL abaixo e aprove somente a leitura da caixa operacional:");
    console.log(url.toString());
  },
});
console.log(JSON.stringify({ mailbox: "gmail", authorization: "stored" }));
