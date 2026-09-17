import { AssetAgeClient } from "@/components/assets/asset-age-client";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Usia Aset & Garansi - ASCIT",
};

export default function AssetAgePage() {
  return <AssetAgeClient />;
}
