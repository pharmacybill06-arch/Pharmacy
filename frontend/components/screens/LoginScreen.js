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
  Easing,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { authApi } from '../../services/api';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const inputRef = useRef(null);

  // Entrance animation: header fades/slides in first, the form card follows ~100ms later
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(20)).current;
  const formFade = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    const easing = Easing.out(Easing.cubic);
    Animated.stagger(100, [
      Animated.parallel([
        Animated.timing(headerFade, { toValue: 1, duration: 450, easing, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 450, easing, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(formFade, { toValue: 1, duration: 500, easing, useNativeDriver: true }),
        Animated.timing(formSlide, { toValue: 0, duration: 500, easing, useNativeDriver: true }),
      ]),
    ]).start();
  }, [headerFade, headerSlide, formFade, formSlide]);

  const validatePhone = (phone) => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone);
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleSendOtp = async () => {
    setError('');

    if (!phoneNumber) {
      setError('Please enter your mobile number');
      shake();
      return;
    }

    if (!validatePhone(phoneNumber)) {
      setError('Please enter a valid 10-digit mobile number');
      shake();
      return;
    }

    setIsLoading(true);
    console.log('[LoginScreen] Sending OTP to:', phoneNumber);

    try {
      const response = await authApi.sendOtp(phoneNumber);
      console.log('[LoginScreen] OTP Response:', response);
      
      if (response.success) {
        console.log('[LoginScreen] Navigating to OTP screen');
        // Navigate to OTP screen with phone number
        router.push({
          pathname: '/auth/otp',
          params: { 
            phone: phoneNumber,
            isNewUser: response.isNewUser,
            devOtp: response.devOtp // Only in development
          }
        });
      } else {
        setError(response.message || 'Failed to send OTP. Please try again.');
        shake();
      }
    } catch (err) {
      console.error('[LoginScreen] Error:', err);
      setError(err.message || 'Failed to send OTP. Please try again.');
      shake();
    } finally {
      setIsLoading(false);
    }
  };

  const formatPhoneNumber = (text) => {
    // Remove non-numeric characters
    const cleaned = text.replace(/\D/g, '');
    // Limit to 10 digits
    return cleaned.slice(0, 10);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.gradient}>
        {/* Decorative circles */}
        <View style={styles.decoCircle1} />
        <View style={styles.decoCircle2} />
        <View style={styles.decoCircle3} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo/Header Section */}
            <Animated.View
              style={[
                styles.headerSection,
                { opacity: headerFade, transform: [{ translateY: headerSlide }] },
              ]}
            >
              <View style={styles.iconContainer}>
                <View style={styles.iconInner}>
                  <Ionicons name="medical" size={36} color="#fff" />
                </View>
              </View>
              <Text style={styles.appName}>Pharma Bills</Text>
              <Text style={styles.tagline}>Smart pharmacy bill management</Text>
            </Animated.View>

            {/* Login Form Section */}
            <Animated.View
              style={[
                styles.formSection,
                { opacity: formFade, transform: [{ translateY: formSlide }] },
              ]}
            >
              <View style={styles.card}>
                <Text style={styles.welcomeText}>Welcome!</Text>
                <Text style={styles.instructionText}>
                  Enter your mobile number to continue
                </Text>

                <Animated.View 
                  style={[
                    styles.inputContainer,
                    { transform: [{ translateX: shakeAnimation }] }
                  ]}
                >
                  <View style={styles.countryCode}>
                    <Text style={styles.countryCodeText}>+91</Text>
                  </View>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder="Enter mobile number"
                    placeholderTextColor="#999"
                    keyboardType="phone-pad"
                    value={phoneNumber}
                    onChangeText={(text) => {
                      setPhoneNumber(formatPhoneNumber(text));
                      setError('');
                    }}
                    maxLength={10}
                    editable={!isLoading}
                  />
                  {phoneNumber.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setPhoneNumber('')}
                      style={styles.clearButton}
                    >
                      <Ionicons name="close-circle" size={20} color="#999" />
                    </TouchableOpacity>
                  )}
                </Animated.View>

                {error ? (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={16} color="#e74c3c" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.sendOtpButton,
                    (!phoneNumber || isLoading) && styles.sendOtpButtonDisabled
                  ]}
                  onPress={handleSendOtp}
                  disabled={!phoneNumber || isLoading}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.sendOtpButtonText}>Send OTP</Text>
                      <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </>
                  )}
                </TouchableOpacity>

                <Text style={styles.termsText}>
                  By continuing, you agree to our{' '}
                  <Text style={styles.linkText}>Terms of Service</Text>
                  {' '}and{' '}
                  <Text style={styles.linkText}>Privacy Policy</Text>
                </Text>
              </View>
            </Animated.View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Secure & encrypted login
              </Text>
              <Ionicons name="shield-checkmark" size={16} color="rgba(255,255,255,0.7)" />
            </View>
          </ScrollView>
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
  decoCircle1: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  decoCircle2: {
    position: 'absolute',
    top: height * 0.3,
    left: -60,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  decoCircle3: {
    position: 'absolute',
    bottom: 80,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerSection: {
    alignItems: 'center',
    marginTop: height * 0.07,
    marginBottom: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  iconInner: {
    width: 70,
    height: 70,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appName: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    fontWeight: '500',
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
  welcomeText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  instructionText: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 28,
    lineHeight: 22,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  countryCode: {
    paddingHorizontal: 16,
    paddingVertical: 17,
    borderRightWidth: 1.5,
    borderRightColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 17,
    fontSize: 18,
    color: '#0F172A',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  clearButton: {
    paddingHorizontal: 12,
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
  sendOtpButton: {
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
  sendOtpButtonDisabled: {
    backgroundColor: '#A5B4FC',
    shadowOpacity: 0,
    elevation: 0,
  },
  sendOtpButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  termsText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
  linkText: {
    color: '#4F46E5',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    gap: 8,
  },
  footerText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '500',
  },
});