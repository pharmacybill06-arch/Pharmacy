import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../services/api';
import Toast from '../ui/Toast';
import ConfirmDialog from '../ui/ConfirmDialog';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, updateUser } = useAuth();
  
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info', title: '' });
  const [confirmLogout, setConfirmLogout] = useState(false);

  const showToast = (message, type = 'info', title = '') => {
    setToast({ visible: true, message, type, title });
  };

  const hideToast = () => {
    setToast({ ...toast, visible: false });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('Name is required', 'error', 'Validation Error');
      return;
    }

    setIsSaving(true);
    try {
      const response = await authApi.updateProfile(user.id, { name, email: email || null });
      
      if (response.success) {
        await updateUser({ name, email: email || null });
        setIsEditing(false);
        showToast('Profile updated successfully!', 'success', 'Success');
      }
    } catch (error) {
      showToast(error.message || 'Failed to update profile', 'error', 'Error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    setConfirmLogout(true);
  };

  const confirmLogoutAction = async () => {
    setConfirmLogout(false);
    setIsLoggingOut(true);
    await logout();
    router.replace('/auth/login');
  };

  const formatPhone = (phone) => {
    if (!phone) return 'Not available';
    return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setIsEditing(!isEditing)}
          >
            <Ionicons 
              name={isEditing ? 'close' : 'create-outline'} 
              size={24} 
              color="#fff" 
            />
          </TouchableOpacity>
        </View>
        
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.name || user?.phone || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.name || 'User'}</Text>
          <Text style={styles.userPhone}>{formatPhone(user?.phone)}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          
          {/* Name Field */}
          <View style={styles.fieldContainer}>
            <View style={styles.fieldIcon}>
              <Ionicons name="person-outline" size={20} color="#4F46E5" />
            </View>
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>Name</Text>
              {isEditing ? (
                <TextInput
                  style={styles.fieldInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  placeholderTextColor="#999"
                />
              ) : (
                <Text style={styles.fieldValue}>{user?.name || 'Not set'}</Text>
              )}
            </View>
          </View>

          {/* Phone Field */}
          <View style={styles.fieldContainer}>
            <View style={styles.fieldIcon}>
              <Ionicons name="call-outline" size={20} color="#4F46E5" />
            </View>
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>Mobile Number</Text>
              <Text style={styles.fieldValue}>{formatPhone(user?.phone)}</Text>
              <Text style={styles.fieldHint}>Phone number cannot be changed</Text>
            </View>
          </View>

          {/* Email Field */}
          <View style={[styles.fieldContainer, styles.lastField]}>
            <View style={styles.fieldIcon}>
              <Ionicons name="mail-outline" size={20} color="#4F46E5" />
            </View>
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>Email (Optional)</Text>
              {isEditing ? (
                <TextInput
                  style={styles.fieldInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              ) : (
                <Text style={styles.fieldValue}>{user?.email || 'Not set'}</Text>
              )}
            </View>
          </View>

          {/* Save Button */}
          {isEditing && (
            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Stats Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account Stats</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>0</Text>
              <Text style={styles.statLabel}>Bills Uploaded</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
              </Text>
              <Text style={styles.statLabel}>Member Since</Text>
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? (
            <ActivityIndicator color="#e74c3c" size="small" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={22} color="#e74c3c" />
              <Text style={styles.logoutButtonText}>Logout</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Toast Notifications */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        title={toast.title}
        onHide={hideToast}
        duration={3000}
      />

      {/* Confirm Logout Dialog */}
      <ConfirmDialog
        visible={confirmLogout}
        title="Logout"
        message="Are you sure you want to logout?"
        type="danger"
        confirmText="Logout"
        cancelText="Cancel"
        onConfirm={confirmLogoutAction}
        onCancel={() => setConfirmLogout(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 16,
    paddingBottom: 44,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    backgroundColor: '#4F46E5',
    overflow: 'hidden',
    position: 'relative',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  editButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarText: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginTop: 14,
    letterSpacing: -0.3,
  },
  userPhone: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    marginTop: -22,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 18,
    letterSpacing: -0.2,
  },
  fieldContainer: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  lastField: {
    borderBottomWidth: 0,
  },
  fieldIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  fieldContent: {
    flex: 1,
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '500',
  },
  fieldInput: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '500',
    paddingVertical: 6,
    paddingHorizontal: 0,
    borderBottomWidth: 2,
    borderBottomColor: '#4F46E5',
  },
  fieldHint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
    fontStyle: 'italic',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 18,
    gap: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  saveButtonDisabled: {
    backgroundColor: '#A5B4FC',
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  statDivider: {
    width: 1,
    height: 44,
    backgroundColor: '#F1F5F9',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4F46E5',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    gap: 10,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  logoutButtonText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomPadding: {
    height: 20,
  },
});
