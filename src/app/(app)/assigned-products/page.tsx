import type { Metadata } from "next";
import { AssignedProductsView } from "@/components/app/assigned-products";

export const metadata: Metadata = {
  title: "Your products",
  description: "The companies and products your paint shop unlocked for you.",
};

export default function AssignedProductsPage() {
  return <AssignedProductsView />;
}
