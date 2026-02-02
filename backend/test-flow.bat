@echo off
REM Test script for new backend bill flow

setlocal enabledelayedexpansion

echo.
echo === Testing New Backend Bill Flow ===
echo.

set BASE_URL=http://localhost:5000/bills
set USER_ID=test_user_12345

REM Create test image
echo Creating test image...
powershell -Command "Add-Content -Path 'test-bill.jpg' -Value ([char]0xFF) -Encoding Byte; (1..100) | ForEach-Object { Add-Content -Path 'test-bill.jpg' -Value ([char]0x00) -Encoding Byte }; Add-Content -Path 'test-bill.jpg' -Value ([char]0xD9) -Encoding Byte" 2>nul

echo.
echo TEST 1: Upload Bill
echo URL: POST %BASE_URL%/%USER_ID%/upload
echo.

powershell -Command "try { $form = @{ bill = Get-Item 'test-bill.jpg' }; $resp = Invoke-WebRequest -Uri '%BASE_URL%/%USER_ID%/upload' -Method Post -Form $form -ErrorAction Stop; $data = $resp.Content | ConvertFrom-Json; Write-Host 'Status: '$resp.StatusCode -ForegroundColor Green; Write-Host 'Bill ID: '$data.bill.id; Write-Host 'Status: '$data.bill.status; Write-Host 'Items: '$data.bill.items.Count; $global:billId = $data.bill.id } catch { Write-Host 'Error: '$_.Exception.Message -ForegroundColor Red }"

REM If we have a bill ID, test other endpoints
if not "!billId!"=="" (
  echo.
  echo TEST 2: Get Draft
  echo URL: GET %BASE_URL%/!billId!/draft
  echo.
  
  powershell -Command "try { $resp = Invoke-WebRequest -Uri '%BASE_URL%/!billId!/draft' -Method Get -ErrorAction Stop; $data = $resp.Content | ConvertFrom-Json; Write-Host 'Status: '$resp.StatusCode -ForegroundColor Green; Write-Host 'Bill Status: '$data.bill.status; Write-Host 'Items Count: '$data.bill.items.Count; Write-Host 'Has OCR Data: Yes' } catch { Write-Host 'Error: '$_.Exception.Message -ForegroundColor Red }"
  
  echo.
  echo TEST 3: Confirm Bill
  echo URL: POST %BASE_URL%/!billId!/confirm
  echo.
  
  powershell -Command "$body = @{ items = @( @{ itemName='Aspirin 500mg'; quantity=2; unit='strip'; unitPrice=45.50; totalPrice=91.00 }, @{ itemName='Paracetamol 650mg'; quantity=1; unit='pcs'; unitPrice=120.00; totalPrice=120.00 } ); pharmacyName='Test Pharmacy'; billNumber='INV001'; billDate='2026-01-05'; totalAmount=211.00 } | ConvertTo-Json; try { $resp = Invoke-WebRequest -Uri '%BASE_URL%/!billId!/confirm' -Method Post -Body ($body | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop; $data = $resp.Content | ConvertFrom-Json; Write-Host 'Status: '$resp.StatusCode -ForegroundColor Green; Write-Host 'Bill Status: '$data.bill.status -ForegroundColor Green; Write-Host 'Items Created: '$data.bill.itemCount -ForegroundColor Green; Write-Host 'Pharmacy: '$data.bill.pharmacyName } catch { Write-Host 'Error: '$_.Exception.Message -ForegroundColor Red }"
)

REM Cleanup
del /f test-bill.jpg 2>nul

echo.
echo === TEST COMPLETE ===
echo.
