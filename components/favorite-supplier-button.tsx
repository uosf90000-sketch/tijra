"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function FavoriteSupplierButton({ sellerBusinessId, initialFavorite }: { sellerBusinessId: string; initialFavorite: boolean }) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/marketplace/favorites", {
        method: favorite ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sellerBusinessId }),
      });
      if (response.ok) {
        setFavorite(!favorite);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" className={`favoriteSupplierButton ${favorite ? "active" : ""}`} onClick={toggle} disabled={loading} aria-pressed={favorite}>
      <Star size={15} fill={favorite ? "currentColor" : "none"} />
      {favorite ? "مورد مفضل" : "أضف للمفضلين"}
    </button>
  );
}
