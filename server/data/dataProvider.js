import { RealDataProvider } from "./meleeRealDataProvider.js";

export function createDataProvider(provider = "real") {
  if (provider !== "real") {
    throw new Error(`Unsupported provider: ${provider}. Only "real" is available.`);
  }

  return new RealDataProvider();
}
