import React, { useState, useRef } from 'react';
import { authApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Pill, Phone, ArrowRight, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const [step, setStep] = useState('phone'); // phone | otp | signup
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [devOtp, setDevOtp] = useState(null);
  const otpRefs = useRef([]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (phone.length !== 10) {
      toast.error('Enter a valid 10-digit phone number');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.sendOtp(phone);
      setDevOtp(res.devOtp || null);
      toast.success('OTP sent successfully!');
      setStep('otp');
    } catch (err) {
      toast.error(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const otpStr = otp.join('');
    if (otpStr.length !== 6) {
      toast.error('Enter complete 6-digit OTP');
      return;
    }
    setLoading(true);
    try {
      const result = await authApi.verifyOtp(phone, otpStr, name || null, shopName || null);
      if (result.isNewUser && !name) {
        setIsNewUser(true);
        setStep('signup');
        setLoading(false);
        return;
      }
      toast.success('Login successful!');
      login(result.user);
    } catch (err) {
      toast.error(err.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    setLoading(true);
    try {
      const otpStr = otp.join('');
      const result = await authApi.verifyOtp(phone, otpStr, name, shopName);
      toast.success('Account created successfully!');
      login(result.user);
    } catch (err) {
      toast.error(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      const res = await authApi.resendOtp(phone);
      setDevOtp(res.devOtp || null);
      toast.success('OTP resent!');
    } catch (err) {
      toast.error(err.message || 'Failed to resend OTP');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1><Pill size={28} style={{ marginRight: 8 }} /> PharmaBill</h1>
        <p className="subtitle">Pharmacy Management System</p>

        {step === 'phone' && (
          <form onSubmit={handleSendOtp}>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  style={{ width: 60, textAlign: 'center' }}
                  value="+91"
                  disabled
                />
                <input
                  className="form-input"
                  type="tel"
                  placeholder="Enter 10-digit phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  maxLength={10}
                  autoFocus
                />
              </div>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading || phone.length !== 10}>
              {loading ? <Loader size={18} className="spinner" /> : <><ArrowRight size={18} /> Send OTP</>}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            {/* Dev OTP Banner */}
            {devOtp && (
              <div style={{
                background: '#fefce8',
                border: '1px solid #fde047',
                borderRadius: 10,
                padding: '10px 16px',
                marginBottom: 16,
                textAlign: 'center',
              }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#854d0e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📋 OTP (Dev Mode)
                </p>
                <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: '0.3em', color: '#1e40af', fontFamily: 'monospace' }}>
                  {devOtp}
                </p>
              </div>
            )}
            <p style={{ textAlign: 'center', fontSize: 14, color: '#6b7280', marginBottom: 8 }}>
              Enter OTP sent to +91 {phone}
            </p>
            <div className="otp-input-group">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={el => otpRefs.current[i] = el}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading || otp.join('').length !== 6}>
              {loading ? <Loader size={18} className="spinner" /> : 'Verify OTP'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={handleResendOtp}>
                Resend OTP
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setStep('phone'); setOtp(['','','','','','']); }}>
                Change Number
              </button>
            </div>
          </form>
        )}

        {step === 'signup' && (
          <form onSubmit={handleSignup}>
            <p style={{ textAlign: 'center', fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
              Complete your profile to get started
            </p>
            <div className="form-group">
              <label className="form-label">Your Name *</label>
              <input
                className="form-input"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Shop Name (optional)</label>
              <input
                className="form-input"
                placeholder="Enter shop name"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading || !name.trim()}>
              {loading ? <Loader size={18} className="spinner" /> : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
