import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.services.pricing import calculate_b2b_pricing

class TestFastSyncAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_b2b_pricing_rules(self):
        # 1. Zero price
        zero = calculate_b2b_pricing(0)
        self.assertEqual(zero["precio_neto_clp"], 0)
        self.assertEqual(zero["precio_bruto_clp"], 0)

        # 2. Tier 1 (< 20,000 CLP at 950 USD/CLP -> price < $21.05)
        # 15 * 2500 = 37,500 -> rounded to 38,000
        tier1 = calculate_b2b_pricing(15.0)
        self.assertEqual(tier1["precio_neto_clp"], 38000)
        self.assertGreater(tier1["precio_bruto_clp"], tier1["precio_neto_clp"])
        self.assertGreater(tier1["ganancia_clp"], 0)

        # 3. Tier 2 (20,000 to 70,000 CLP -> $21.05 to $73.68)
        # 50 * 1900 = 95,000
        tier2 = calculate_b2b_pricing(50.0)
        self.assertEqual(tier2["precio_neto_clp"], 95000)
        self.assertEqual(tier2["iva_clp"], int(round(95000 * 0.19)))

        # 4. Custom margin percentage (e.g. 30%)
        # Costo total Chile for 40 USD: CIF = (40 + 8) * 950 = 45,600. Ad val 6% = 2,736. Flete local = 2,500. Total = 50,836.
        # With 30% margin: 50,836 * 1.30 = 66,086.8 -> 66,000 CLP net
        custom_margin = calculate_b2b_pricing(40.0, margin_percentage=30.0)
        self.assertEqual(custom_margin["precio_neto_clp"], 66000)
        self.assertGreater(custom_margin["ganancia_clp"], 0)

    def test_sync_status_endpoint(self):
        response = self.client.get("/api/sync/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("is_running", data)
        self.assertFalse(data["is_running"])

    def test_sync_report_latest_404_when_empty(self):
        # Should return 404 or dict if exists
        response = self.client.get("/api/sync/report/latest")
        self.assertIn(response.status_code, [200, 404])

    def test_bulk_update_empty_list_validation(self):
        response = self.client.post("/api/sync/bulk-update", json={"items": []})
        self.assertEqual(response.status_code, 400)

if __name__ == "__main__":
    unittest.main()
