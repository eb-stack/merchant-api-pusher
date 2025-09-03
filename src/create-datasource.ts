import "dotenv/config";
import { createPrimaryDataSourceIfMissing } from "./google";

async function main() {
  const name = await createPrimaryDataSourceIfMissing("Primary API Source");
  console.log(name);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
