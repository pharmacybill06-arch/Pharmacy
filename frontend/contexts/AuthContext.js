import React, { createContext, useContext, useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { authApi, userApi } from '../services/api';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';

async function registerPushTokenForUser(userId) {
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      await userApi.savePushToken(userId, token);
    }
  } catch (error) {
    console.warn('[Auth] Push token registration failed:', error.message);
  }
}

const AUTH_STORAGE_KEY = 'pharmacy_bill_auth';
const AUTH_FILE_PATH = `${FileSystem.documentDirectory}auth_data.json`;

// File-system based persistent storage (no native module rebuild needed)
const Storage = {
  getItem: async (key) => {
    try {
      const info = await FileSystem.getInfoAsync(AUTH_FILE_PATH);
      if (!info.exists) return null;
      const content = await FileSystem.readAsStringAsync(AUTH_FILE_PATH);
      const data = JSON.parse(content);
      return data[key] || null;
    } catch (e) {
      console.warn('[Storage] getItem error:', e.message);
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      let data = {};
      const info = await FileSystem.getInfoAsync(AUTH_FILE_PATH);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(AUTH_FILE_PATH);
        data = JSON.parse(content);
      }
      data[key] = value;
      await FileSystem.writeAsStringAsync(AUTH_FILE_PATH, JSON.stringify(data));
    } catch (e) {
      console.warn('[Storage] setItem error:', e.message);
    }
  },
  removeItem: async (key) => {
    try {
      const info = await FileSystem.getInfoAsync(AUTH_FILE_PATH);
      if (!info.exists) return;
      const content = await FileSystem.readAsStringAsync(AUTH_FILE_PATH);
      const data = JSON.parse(content);
      delete data[key];
      await FileSystem.writeAsStringAsync(AUTH_FILE_PATH, JSON.stringify(data));
    } catch (e) {
      console.warn('[Storage] removeItem error:', e.message);
    }
  },
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Load user from storage on app start
  useEffect(() => {
    loadStoredUser();
  }, []);

  const loadStoredUser = async () => {
    try {
      const storedData = await Storage.getItem(AUTH_STORAGE_KEY);
      if (storedData) {
        const userData = JSON.parse(storedData);
        
        // Validate user still exists on backend (DB may have been reset)
        try {
          await authApi.getProfile(userData.id);
          setUser(userData);
          setIsAuthenticated(true);
          registerPushTokenForUser(userData.id);
        } catch (validationError) {
          console.log('[Auth] Stored user no longer exists on server, clearing session. Re-login required.');
          await Storage.removeItem(AUTH_STORAGE_KEY);
          setUser(null);
          setIsAuthenticated(false);
        }
      }
    } catch (error) {
      console.error('Error loading stored user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (userData) => {
    try {
      await Storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
      setUser(userData);
      setIsAuthenticated(true);
      registerPushTokenForUser(userData.id);
      return true;
    } catch (error) {
      console.error('Error storing user data:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await Storage.removeItem(AUTH_STORAGE_KEY);
      setUser(null);
      setIsAuthenticated(false);
      return true;
    } catch (error) {
      console.error('Error removing user data:', error);
      return false;
    }
  };

  const updateUser = async (updatedData) => {
    try {
      const newUserData = { ...user, ...updatedData };
      await Storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newUserData));
      setUser(newUserData);
      return true;
    } catch (error) {
      console.error('Error updating user data:', error);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
