import React, { createContext, useContext, useState, useEffect } from 'react';

// Simple in-memory storage - no native modules required
// Note: Data will be lost on app restart, but works in any environment
// For production, rebuild with AsyncStorage or SecureStore
let memoryStorage = {};

const AUTH_STORAGE_KEY = 'pharmacy_bill_auth';

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
      const storedData = memoryStorage[AUTH_STORAGE_KEY];
      if (storedData) {
        const userData = JSON.parse(storedData);
        setUser(userData);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Error loading stored user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (userData) => {
    try {
      memoryStorage[AUTH_STORAGE_KEY] = JSON.stringify(userData);
      setUser(userData);
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      console.error('Error storing user data:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      delete memoryStorage[AUTH_STORAGE_KEY];
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
      memoryStorage[AUTH_STORAGE_KEY] = JSON.stringify(newUserData);
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
