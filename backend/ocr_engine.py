#!/usr/bin/env python3
"""
EasyOCR-based OCR Engine for Bill/Receipt Extraction
Provides high-accuracy text extraction with line-by-line results
"""

import sys
import json
import easyocr
from PIL import Image
import argparse
from datetime import datetime

# Initialize reader once (reuse across calls if possible)
reader = None

def preprocess_image(image_path):
    """Preprocess image for better OCR accuracy"""
    try:
        img = Image.open(image_path)
        
        # Enhance contrast
        from PIL import ImageEnhance
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.5)
        
        # Enhance brightness
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(1.2)
        
        # Convert to RGB if needed
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        return img
    except Exception as e:
        print(f"Error preprocessing image: {e}", file=sys.stderr)
        return Image.open(image_path)

def extract_text_with_easyocr(image_path, language='en'):
    """
    Extract text from image using EasyOCR
    Returns structured output with lines and metadata
    """
    global reader
    
    try:
        # Initialize reader if not already done
        if reader is None:
            print(f"[EasyOCR] Initializing reader for language: {language}", file=sys.stderr)
            reader = easyocr.Reader([language], gpu=False, verbose=False)
        
        print(f"[EasyOCR] Processing image: {image_path}", file=sys.stderr)
        
        # Preprocess image
        img = preprocess_image(image_path)
        
        # Run OCR
        print(f"[EasyOCR] Running text detection and recognition...", file=sys.stderr)
        results = reader.readtext(image_path, detail=1)
        
        if not results:
            raise Exception("No text detected in image")
        
        # Extract text and organize by lines
        raw_text = ""
        lines = []
        total_confidence = 0
        
        # Group results by Y-coordinate (line-by-line)
        line_data = {}
        for (bbox, text, confidence) in results:
            # Get Y-coordinate of top of bounding box
            y_coord = min(point[1] for point in bbox)
            y_bucket = round(y_coord / 10) * 10  # Group by ~10 pixel bands
            
            if y_bucket not in line_data:
                line_data[y_bucket] = []
            
            line_data[y_bucket].append({
                'text': text,
                'confidence': confidence,
                'bbox': bbox
            })
        
        # Process lines in order
        line_number = 1
        for y_coord in sorted(line_data.keys()):
            # Sort items in line by X coordinate (left to right)
            items = sorted(line_data[y_coord], key=lambda x: min(point[0] for point in x['bbox']))
            
            line_text = ' '.join([item['text'] for item in items])
            line_confidence = sum([item['confidence'] for item in items]) / len(items)
            
            raw_text += line_text + "\n"
            lines.append({
                "lineNumber": line_number,
                "content": line_text,
                "length": len(line_text),
                "confidence": round(line_confidence, 4)
            })
            
            total_confidence += line_confidence
            line_number += 1
        
        # Calculate average confidence
        avg_confidence = total_confidence / len(lines) if lines else 0
        
        # Prepare response
        response = {
            "success": True,
            "rawText": raw_text.strip(),
            "lines": lines,
            "metadata": {
                "totalLines": len(lines),
                "totalCharacters": len(raw_text),
                "extractedAt": datetime.utcnow().isoformat() + "Z",
                "confidence": round(avg_confidence, 4),
                "ocrEngine": "easyocr",
                "status": "draft"
            }
        }
        
        print(f"[EasyOCR] ✓ Extraction complete - {len(lines)} lines, {avg_confidence*100:.1f}% confidence", file=sys.stderr)
        
        return response
        
    except Exception as e:
        print(f"[EasyOCR] ✗ Error: {str(e)}", file=sys.stderr)
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='OCR extraction using EasyOCR')
    parser.add_argument('image_path', help='Path to image file')
    parser.add_argument('--language', default='en', help='OCR language (default: en)')
    
    args = parser.parse_args()
    
    result = extract_text_with_easyocr(args.image_path, args.language)
    print(json.dumps(result))
