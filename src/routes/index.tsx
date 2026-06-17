import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flowmart" },
      { name: "description", content: "Flowmart - ดีลกลุ่มสินค้าราคาส่งจากโรงงาน" },
      { property: "og:title", content: "Flowmart" },
      { property: "og:description", content: "Flowmart - ดีลกลุ่มสินค้าราคาส่งจากโรงงาน" },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.location.replace("/flowmart.html");
  }, []);
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui" }}>
      กำลังโหลด Flowmart...
    </div>
  );
}
