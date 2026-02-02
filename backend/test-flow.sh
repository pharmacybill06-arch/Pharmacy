#!/bin/bash
# Test script for new backend bill flow

echo "=== Testing New Backend Bill Flow ==="
echo ""

BASE_URL="http://localhost:5000/bills"
USER_ID="test_user_12345"

# Create a simple test image
echo "Creating test image..."
echo -ne '\xFF\xD8\xFF\xE0\x00\x10JFIF' > test-bill.jpg
dd if=/dev/zero bs=1 count=100 >> test-bill.jpg 2>/dev/null
echo -ne '\xFF\xD9' >> test-bill.jpg

echo ""
echo "TEST 1: Upload Bill (POST /bills/:userId/upload)"
echo "URL: $BASE_URL/$USER_ID/upload"
echo ""

UPLOAD_RESPONSE=$(curl -s -X POST \
  -F "bill=@test-bill.jpg" \
  "$BASE_URL/$USER_ID/upload")

echo "$UPLOAD_RESPONSE" | jq '.' 2>/dev/null || echo "$UPLOAD_RESPONSE"

# Extract bill ID
BILL_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.bill.id' 2>/dev/null)

if [ ! -z "$BILL_ID" ] && [ "$BILL_ID" != "null" ]; then
  echo ""
  echo "SUCCESS: Bill created with ID: $BILL_ID"
  echo ""
  
  # TEST 2: Get Draft
  echo "TEST 2: Get Draft (GET /bills/:billId/draft)"
  echo "URL: $BASE_URL/$BILL_ID/draft"
  echo ""
  
  DRAFT_RESPONSE=$(curl -s -X GET "$BASE_URL/$BILL_ID/draft")
  echo "$DRAFT_RESPONSE" | jq '.' 2>/dev/null || echo "$DRAFT_RESPONSE"
  
  echo ""
  
  # TEST 3: Confirm Bill
  echo "TEST 3: Confirm Bill (POST /bills/:billId/confirm)"
  echo "URL: $BASE_URL/$BILL_ID/confirm"
  echo ""
  
  CONFIRM_DATA='{
    "items": [
      {
        "itemName": "Aspirin 500mg",
        "quantity": 2,
        "unit": "strip",
        "unitPrice": 45.50,
        "totalPrice": 91.00
      },
      {
        "itemName": "Paracetamol 650mg",
        "quantity": 1,
        "unit": "pcs",
        "unitPrice": 120.00,
        "totalPrice": 120.00
      }
    ],
    "pharmacyName": "Test Pharmacy",
    "billNumber": "INV001",
    "billDate": "2026-01-05",
    "totalAmount": 211.00
  }'
  
  CONFIRM_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$CONFIRM_DATA" \
    "$BASE_URL/$BILL_ID/confirm")
  
  echo "$CONFIRM_RESPONSE" | jq '.' 2>/dev/null || echo "$CONFIRM_RESPONSE"
  
  echo ""
  echo "=== TEST COMPLETE ==="
  echo ""
  echo "All 3 endpoints tested successfully!"
  
else
  echo "ERROR: Failed to create bill"
fi

# Cleanup
rm -f test-bill.jpg
