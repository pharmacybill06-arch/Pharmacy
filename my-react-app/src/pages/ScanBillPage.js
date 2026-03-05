import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { aiApi } from '../services/api';
import { Upload, Camera, Loader, X, Zap, Eye } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ScanBillPage() {
  useAuth(); // ensure authenticated
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState('upload'); // upload | ocr | review | parsing
  const [dragging, setDragging] = useState(false);

  // Compress image client-side before uploading (key for accuracy)
  const compressImage = useCallback(async (file, maxWidth = 2000, quality = 0.85) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Scale down if needed
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }
        if (height > maxWidth) {
          width = Math.round(width * (maxWidth / height));
          height = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // White background (helps OCR on transparent PNGs)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressed = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
              console.log(`[Compress] ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB (${width}×${height})`);
              resolve(compressed);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const handleFileSelect = useCallback(async (file) => {
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please select an image file (JPEG, PNG, WebP, BMP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Max 10MB.');
      return;
    }
    // Compress image for better OCR accuracy and faster upload
    const compressed = await compressImage(file);
    setSelectedFile(compressed);
    setPreview(URL.createObjectURL(compressed));
    setOcrText('');
    setStage('upload');
  }, [compressImage]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  // OCR using OCR.space (backend) — much more accurate than Tesseract.js
  const runOCR = async () => {
    if (!selectedFile) return;
    setProcessing(true);
    setStage('ocr');
    setOcrProgress(30);

    try {
      setOcrProgress(60);
      const result = await aiApi.ocrImage(selectedFile, false);
      setOcrProgress(100);

      const text = result.ocrText || '';
      if (!text || text.trim().length < 10) {
        toast.error('Could not extract text from image. Try a clearer image.');
        setStage('upload');
        setProcessing(false);
        return;
      }

      setOcrText(text);
      setStage('review');
      toast.success('OCR completed successfully!');
    } catch (err) {
      console.error('OCR Error:', err);
      toast.error(err.message || 'OCR failed. Please try again.');
      setStage('upload');
    } finally {
      setProcessing(false);
    }
  };

  // One-click: OCR.space + AI parse combined
  const runOCRAndParse = async () => {
    if (!selectedFile) return;
    setProcessing(true);
    setStage('parsing');

    try {
      const result = await aiApi.ocrImage(selectedFile, true);
      console.log('[ScanBill] OCR+AI result:', JSON.stringify(result, null, 2));

      if (result.data) {
        toast.success('Bill parsed successfully! (OCR.space + AI)');
        navigate('/bill-form', {
          state: {
            parsedData: result.data,
            ocrText: result.ocrText || '',
            imageFile: selectedFile,
          },
        });
      } else {
        setOcrText(result.ocrText || '');
        setStage('review');
        toast.success('OCR done. Review text and parse with AI.');
      }
    } catch (err) {
      console.error('OCR+Parse Error:', err);
      toast.error(err.message || 'Failed. Try Vision AI instead.');
      setStage('upload');
    } finally {
      setProcessing(false);
    }
  };

  const parseWithVision = async () => {
    if (!selectedFile) return;
    setProcessing(true);
    setStage('parsing');

    try {
      // Send image directly to vision AI - much more accurate than OCR+text
      const result = await aiApi.parseImage(selectedFile, ocrText || '');
      console.log('[ScanBill] Vision AI result:', JSON.stringify(result, null, 2));
      toast.success(`Bill parsed successfully! (${result.method === 'vision' ? 'Vision AI' : 'AI'})`);
      const parsed = result.data || result.parsedData || result;
      navigate('/bill-form', {
        state: {
          parsedData: parsed,
          ocrText: ocrText || '',
          imageFile: selectedFile,
        },
      });
    } catch (err) {
      console.error('Vision Parse Error:', err);
      toast.error(err.message || 'Vision parsing failed. Trying OCR method...');
      // Fall back to OCR + text method
      if (ocrText && ocrText.trim().length > 10) {
        try {
          const result = await aiApi.parseOcr(ocrText);
          const parsed = result.data || result.parsedData || result;
          toast.success('Parsed with OCR text (fallback)');
          navigate('/bill-form', { state: { parsedData: parsed, ocrText, imageFile: selectedFile } });
          return;
        } catch (e) { /* ignore, go to manual */ }
      }
      navigate('/bill-form', {
        state: { parsedData: null, ocrText: ocrText || '', imageFile: selectedFile },
      });
    } finally {
      setProcessing(false);
    }
  };

  const parseWithAI = async () => {
    if (!ocrText.trim()) return;
    setProcessing(true);
    setStage('parsing');

    try {
      // Use vision if image is available, otherwise text-only
      let result;
      if (selectedFile) {
        result = await aiApi.parseImage(selectedFile, ocrText);
      } else {
        result = await aiApi.parseOcr(ocrText);
      }
      console.log('[ScanBill] AI parse result:', JSON.stringify(result, null, 2));
      toast.success('Bill parsed successfully!');
      const parsed = result.data || result.parsedData || result;
      console.log('[ScanBill] Passing parsedData to form:', JSON.stringify(parsed, null, 2));
      navigate('/bill-form', {
        state: {
          parsedData: parsed,
          ocrText,
          imageFile: selectedFile,
        },
      });
    } catch (err) {
      console.error('AI Parse Error:', err);
      toast.error(err.message || 'Failed to parse bill. You can enter data manually.');
      // Navigate to bill form with just OCR text
      navigate('/bill-form', {
        state: {
          parsedData: null,
          ocrText,
          imageFile: selectedFile,
        },
      });
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setPreview(null);
    setOcrText('');
    setOcrProgress(0);
    setStage('upload');
    setProcessing(false);
  };

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Scan Bill</h2>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Upload a bill image and Vision AI will read it directly for 90%+ accuracy
      </p>

      {/* Step Indicator */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        {['Upload Image', 'Parse / OCR', 'Review Text', 'AI Parsing'].map((label, i) => {
          const stepNames = ['upload', 'ocr', 'review', 'parsing'];
          const currentIdx = stepNames.indexOf(stage);
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600,
                background: isDone ? '#16a34a' : isActive ? '#2563eb' : '#e5e7eb',
                color: isDone || isActive ? 'white' : '#6b7280',
              }}>
                {isDone ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? '#2563eb' : '#6b7280' }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1fr' : '1fr', gap: 24 }}>
        {/* Left: Upload / Preview */}
        <div className="card">
          <div className="card-header">
            <h3>{preview ? 'Bill Image' : 'Upload Bill Image'}</h3>
            {preview && (
              <button className="btn btn-ghost btn-sm" onClick={reset}>
                <X size={14} /> Clear
              </button>
            )}
          </div>
          <div className="card-body">
            {!preview ? (
              <>
                <div
                  className={`upload-zone ${dragging ? 'dragging' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <div className="upload-zone-icon">
                    <Upload size={48} />
                  </div>
                  <h4>Drop bill image here or click to browse</h4>
                  <p>Supports JPEG, PNG, WebP, BMP • Max 10MB</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                />
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>or</span>
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: 8 }}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera size={16} /> Take Photo
                </button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                />
              </>
            ) : (
              <div>
                <img
                  src={preview}
                  alt="Bill preview"
                  style={{ width: '100%', borderRadius: 8, marginBottom: 16 }}
                />
                <p style={{ fontSize: 13, color: '#6b7280' }}>
                  {selectedFile?.name} • {(selectedFile?.size / 1024).toFixed(1)} KB
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: OCR / Review / Action */}
        {preview && (
          <div className="card">
            <div className="card-header">
              <h3>
                {stage === 'upload' && 'Ready to Scan'}
                {stage === 'ocr' && 'Running OCR...'}
                {stage === 'review' && 'Extracted Text'}
                {stage === 'parsing' && 'Parsing with AI...'}
              </h3>
            </div>
            <div className="card-body">
              {stage === 'upload' && (
                <div style={{ textAlign: 'center', padding: 28 }}>
                  <Eye size={48} style={{ color: '#7c3aed', marginBottom: 16 }} />
                  <p style={{ color: '#374151', fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                    Image loaded. Choose how to parse:
                  </p>
                  <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>
                    Vision AI reads the image directly • OCR.space extracts text first
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 300, margin: '0 auto' }}>
                    <button className="btn btn-primary btn-lg" onClick={parseWithVision} disabled={processing} style={{ background: '#7c3aed' }}>
                      <Eye size={18} /> Smart Scan (Gemini Vision)
                      <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.8 }}>(best accuracy)</span>
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={runOCRAndParse} disabled={processing}>
                      <Zap size={16} /> OCR.space + AI Parse (backup)
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={runOCR} disabled={processing} style={{ fontSize: 12 }}>
                      Just extract text (manual review)
                    </button>
                  </div>
                </div>
              )}

              {stage === 'ocr' && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Loader size={48} className="spinner" style={{ color: '#2563eb', marginBottom: 16 }} />
                  <p style={{ fontWeight: 600, marginBottom: 8 }}>Extracting text from image...</p>
                  <div className="progress-bar" style={{ maxWidth: 300, margin: '0 auto' }}>
                    <div className="progress-bar-fill" style={{ width: `${ocrProgress}%` }} />
                  </div>
                  <p style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>{ocrProgress}% complete</p>
                </div>
              )}

              {stage === 'review' && (
                <div>
                  <textarea
                    className="form-input"
                    rows={16}
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}
                  />
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                    You can edit the text above if OCR made mistakes.
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button className="btn btn-primary" onClick={parseWithAI} disabled={processing}>
                      <Zap size={16} /> Parse with AI
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => navigate('/bill-form', { state: { parsedData: null, ocrText, imageFile: selectedFile } })}
                    >
                      Enter Manually
                    </button>
                  </div>
                </div>
              )}

              {stage === 'parsing' && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Loader size={48} className="spinner" style={{ color: '#7c3aed', marginBottom: 16 }} />
                  <p style={{ fontWeight: 600 }}>Parsing bill with AI...</p>
                  <p style={{ fontSize: 13, color: '#6b7280' }}>Extracting items, prices, and details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
