import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { authApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const { width, height } = Dimensions.get('window');
const OTP_LENGTH = 6;

export default function OtpScreen() {
  const router = useRouter();
  const { phone, isNewUser, devOtp } = useLocalSearchParams();
  const { login } = useAuth();
  
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [shopName, setShopName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  
  const inputRefs = useRef([]);
  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Timer for resend OTP
  useEffect(() => {
    let interval;
    if (resendTimer > 0 && !canResend) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    } else if (resendTimer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Fade in animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // Auto-focus first input
  useEffect(() => {
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 500);
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleOtpChange = (text, index) => {
    // Only allow numbers
    const digit = text.replace(/\D/g, '').slice(-1);
    
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError('');

    // Move to next input
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all digits entered
    if (digit && index === OTP_LENGTH - 1) {
      const fullOtp = newOtp.join('');
      if (fullOtp.length === OTP_LENGTH) {
        handleVerifyOtp(fullOtp);
      }
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (otpString = null) => {
    const fullOtp = otpString || otp.join('');
    
    if (fullOtp.length !== OTP_LENGTH) {
      setError('Please enter the complete 6-digit OTP');
      shake();
      return;
    }

    // Check if name is needed for new users
    if (isNewUser === 'true' && !name.trim()) {
      setError('Please enter your name');
      shake();
      return;
    }

    if (isNewUser === 'true' && !shopName.trim()) {
      setError('Please enter your shop/pharmacy name');
      shake();
      return;
    }

    setIsLoading(true);

    try {
      const response = await authApi.verifyOtp(phone, fullOtp, name || null, shopName || null);
      
      if (response.success) {
        // Store user in auth context
        await login(response.user);
        
        // Navigate to main app
        router.replace('/(tabs)');
      }
    } catch (err) {
      setError(err.message || 'Invalid OTP. Please try again.');
      shake();
      // Clear OTP inputs on error
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;

    setIsResending(true);
    setError('');

    try {
      const response = await authApi.resendOtp(phone);
      
      if (response.success) {
        setCanResend(false);
        setResendTimer(30);
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        // Show dev OTP in console for testing
        if (response.devOtp) {
          console.log('New OTP:', response.devOtp);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to resend OTP');
    } finally {
      setIsResending(false);
    }
  };

  const formatPhone = (phoneNumber) => {
    if (!phoneNumber) return '';
    return `+91 ${phoneNumber.slice(0, 5)} ${phoneNumber.slice(5)}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.gradient}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <Animated.View style={[styles.content, { opacity: fadeAnim, flex: 1 }]}> 
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, minHeight: '100%', paddingBottom: 48 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Back Button */}
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>

              {/* Header Section */}
              <View style={styles.headerSection}>
                <View style={styles.iconContainer}>
                  <Ionicons name="chatbox-ellipses" size={40} color="#fff" />
                </View>
                <Text style={styles.title}>Verify OTP</Text>
                <Text style={styles.subtitle}>
                  Enter the 6-digit code sent to
                </Text>
                <Text style={styles.phoneNumber}>{formatPhone(phone)}</Text>
              </View>

              {/* OTP Form Section */}
              <View style={styles.formSection}>
                <View style={styles.card}>
                  {/* Dev OTP hint - only in development */}
                  {devOtp && (
                    <View style={styles.devHint}>
                      <Ionicons name="information-circle" size={16} color="#4F46E5" />
                      <Text style={styles.devHintText}>Dev OTP: {devOtp}</Text>
                    </View>
                  )}

                  {/* Name input for new users */}
                  {isNewUser === 'true' && (
                    <View style={styles.nameInputContainer}>
                    <Text style={styles.nameLabel}>Your Name</Text>
                    <TextInput
                      style={styles.nameInput}
                      placeholder="Enter your name"
                      placeholderTextColor="#999"
                      value={name}
                      onChangeText={(text) => {
                        setName(text);
                        setError('');
                      }}
                      editable={!isLoading}
                    />
                  </View>
                )}

                {isNewUser === 'true' && (
                    <View style={styles.nameInputContainer}>
                    <Text style={styles.nameLabel}>Shop / Pharmacy Name</Text>
                    <TextInput
                      style={styles.nameInput}
                      placeholder="Enter your shop or pharmacy name"
                      placeholderTextColor="#999"
                      value={shopName}
                      onChangeText={(text) => {
                        setShopName(text);
                        setError('');
                      }}
                      editable={!isLoading}
                    />
                  </View>
                )}

                {/* OTP Input */}
                <Text style={styles.otpLabel}>Enter OTP</Text>
                <Animated.View 
                  style={[
                    styles.otpContainer,
                    { transform: [{ translateX: shakeAnimation }] }
                  ]}
                >
                  {otp.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => (inputRefs.current[index] = ref)}
                      style={[
                        styles.otpInput,
                        digit && styles.otpInputFilled,
                        error && styles.otpInputError,
                      ]}
                      value={digit}
                      onChangeText={(text) => handleOtpChange(text, index)}
                      onKeyPress={(e) => handleKeyPress(e, index)}
                      keyboardType="number-pad"
                      maxLength={1}
                      editable={!isLoading}
                      selectTextOnFocus
                    />
                  ))}
                </Animated.View>

                {error ? (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={16} color="#e74c3c" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {/* Verify Button */}
                <TouchableOpacity
                  style={[
                    styles.verifyButton,
                    isLoading && styles.verifyButtonDisabled
                  ]}
                  onPress={() => handleVerifyOtp()}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.verifyButtonText}>Verify & Continue</Text>
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    </>
                  )}
                </TouchableOpacity>

                {/* Resend OTP */}
                <View style={styles.resendContainer}>
                  <Text style={styles.resendText}>Didn't receive the code? </Text>
                  {canResend ? (
                    <TouchableOpacity 
                      onPress={handleResendOtp}
                      disabled={isResending}
                    >
                      {isResending ? (
                        <ActivityIndicator size="small" color="#4F46E5" />
                      ) : (
                        <Text style={styles.resendLink}>Resend OTP</Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.timerText}>
                      Resend in {resendTimer}s
                    </Text>
                  )}
                </View>
              </View>
            </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    backgroundColor: '#4F46E5',
    paddingTop: Platform.OS === 'android' ? 25 : 0,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Platform.OS === 'ios' ? 0 : 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  headerSection: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  phoneNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  formSection: {
    flex: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 12,
  },
  devHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  devHintText: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '600',
  },
  nameInputContainer: {
    marginBottom: 20,
  },
  nameLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  nameInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    fontWeight: '500',
  },
  otpLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  otpInput: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 52,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    fontSize: 24,
    lineHeight: 10,
    fontWeight: '800',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingVertical: 0,
    color: '#0F172A',
  },
  otpInputFilled: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  otpInputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#FEF2F2',
    paddingVertical: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    marginLeft: 6,
    fontWeight: '500',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 16,
    paddingVertical: 17,
    marginTop: 24,
    gap: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  verifyButtonDisabled: {
    backgroundColor: '#A5B4FC',
    shadowOpacity: 0,
    elevation: 0,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  resendText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4F46E5',
  },
  timerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
});