import React, { useState, useRef } from 'react';
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
            <View style={styles.headerSection}>
              <View style={styles.iconContainer}>
                <Ionicons name="medical" size={50} color="#fff" />
              </View>
              <Text style={styles.appName}>Pharmacy Bills</Text>
              <Text style={styles.tagline}>Manage your medical bills easily</Text>
            </View>

            {/* Login Form Section */}
            <View style={styles.formSection}>
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
            </View>

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
    backgroundColor: '#667eea',
    paddingTop: Platform.OS === 'android' ? 25 : 0,
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
    marginTop: height * 0.08,
    marginBottom: 48,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  formSection: {
    flex: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 15,
    color: '#666',
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e9ecef',
    overflow: 'hidden',
  },
  countryCode: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: '#e9ecef',
    backgroundColor: '#f1f3f4',
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    color: '#333',
    letterSpacing: 1,
  },
  clearButton: {
    paddingHorizontal: 12,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 13,
    marginLeft: 6,
  },
  sendOtpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#667eea',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 24,
    gap: 8,
  },
  sendOtpButtonDisabled: {
    backgroundColor: '#b8c1ec',
  },
  sendOtpButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
  },
  linkText: {
    color: '#667eea',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    gap: 6,
  },
  footerText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
});