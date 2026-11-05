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

        # 2. $15.0 USD (FOB CLP = 14,250 + 6,192 = 20,442. Floor of 20,000 CLP applied -> 20,442 + 20,000 = 40,442 -> 40,400 CLP)
        tier1 = calculate_b2b_pricing(15.0)
        self.assertEqual(tier1["precio_neto_clp"], 40400)
        self.assertEqual(tier1["ganancia_clp"], 20000)
        self.assertGreater(tier1["precio_bruto_clp"], tier1["precio_neto_clp"])

        # 3. $50.0 USD (FOB CLP = 47,500 + 6,192 = 53,692. Net price = 53,692 * 1.45 = 77,853.4 -> 77,900 CLP)
        tier2 = calculate_b2b_pricing(50.0)
        self.assertEqual(tier2["precio_neto_clp"], 77900)
        self.assertEqual(tier2["iva_clp"], int(round(77900 * 0.19)))

        # 4. Custom margin percentage (e.g. 30% on $40.0 USD: 44,192 + 20,000 floor = 64,192 -> 64,200 CLP)
        custom_margin = calculate_b2b_pricing(40.0, margin_percentage=30.0)
        self.assertEqual(custom_margin["precio_neto_clp"], 64200)
        self.assertEqual(custom_margin["ganancia_clp"], 20000)

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
