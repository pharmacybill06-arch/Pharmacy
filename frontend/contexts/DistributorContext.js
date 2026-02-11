import React, { createContext, useContext, useState, useCallback } from 'react';
import { distributorApi } from '@/services/api';

/**
 * Distributor Context
 * Manages distributor state and provides CRUD operations
 */
const DistributorContext = createContext(null);

export function DistributorProvider({ children }) {
  const [distributors, setDistributors] = useState([]);
  const [selectedDistributor, setSelectedDistributor] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch all distributors for a user
   */
  const fetchDistributors = useCallback(async (userId, options = {}) => {
    if (!userId) return;
    
    try {
      setIsLoading(true);
      setError(null);
      const response = await distributorApi.getDistributors(userId, options);
      setDistributors(response.distributors || []);
      return response.distributors;
    } catch (err) {
      console.error('Error fetching distributors:', err);
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Search distributors for autocomplete
   */
  const searchDistributors = useCallback(async (userId, query) => {
    if (!userId || !query || query.length < 2) return [];
    
    try {
      const response = await distributorApi.searchDistributors(userId, query);
      return response.distributors || [];
    } catch (err) {
      console.error('Error searching distributors:', err);
      return [];
    }
  }, []);

  /**
   * Get single distributor with details
   */
  const getDistributor = useCallback(async (distributorId) => {
    try {
      setIsLoading(true);
      const response = await distributorApi.getDistributorById(distributorId);
      setSelectedDistributor(response.distributor);
      return response.distributor;
    } catch (err) {
      console.error('Error fetching distributor:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get bills for a distributor
   */
  const getDistributorBills = useCallback(async (distributorId, options = {}) => {
    try {
      const response = await distributorApi.getDistributorBills(distributorId, options);
      return response;
    } catch (err) {
      console.error('Error fetching distributor bills:', err);
      return { bills: [], total: 0 };
    }
  }, []);

  /**
   * Create a new distributor
   */
  const createDistributor = useCallback(async (userId, data) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await distributorApi.createDistributor(userId, data);
      
      // Add to local state
      setDistributors(prev => [...prev, response.distributor]);
      
      return response.distributor;
    } catch (err) {
      console.error('Error creating distributor:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Update a distributor
   */
  const updateDistributor = useCallback(async (distributorId, data) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await distributorApi.updateDistributor(distributorId, data);
      
      // Update local state
      setDistributors(prev => 
        prev.map(d => d.id === distributorId ? { ...d, ...response.distributor } : d)
      );
      
      if (selectedDistributor?.id === distributorId) {
        setSelectedDistributor(response.distributor);
      }
      
      return response.distributor;
    } catch (err) {
      console.error('Error updating distributor:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [selectedDistributor]);

  /**
   * Delete a distributor (soft delete)
   */
  const deleteDistributor = useCallback(async (distributorId) => {
    try {
      setIsLoading(true);
      setError(null);
      await distributorApi.deleteDistributor(distributorId);
      
      // Remove from local state
      setDistributors(prev => prev.filter(d => d.id !== distributorId));
      
      if (selectedDistributor?.id === distributorId) {
        setSelectedDistributor(null);
      }
    } catch (err) {
      console.error('Error deleting distributor:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [selectedDistributor]);

  /**
   * Migrate existing pharmacyName to distributors
   */
  const migratePharmacyNames = useCallback(async (userId) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await distributorApi.migratePharmacyNames(userId);
      
      // Refresh distributors after migration
      await fetchDistributors(userId);
      
      return response;
    } catch (err) {
      console.error('Error during migration:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchDistributors]);

  /**
   * Clear selected distributor
   */
  const clearSelectedDistributor = useCallback(() => {
    setSelectedDistributor(null);
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    // State
    distributors,
    selectedDistributor,
    isLoading,
    error,
    
    // Actions
    fetchDistributors,
    searchDistributors,
    getDistributor,
    getDistributorBills,
    createDistributor,
    updateDistributor,
    deleteDistributor,
    migratePharmacyNames,
    clearSelectedDistributor,
    clearError,
    setSelectedDistributor,
  };

  return (
    <DistributorContext.Provider value={value}>
      {children}
    </DistributorContext.Provider>
  );
}

/**
 * Hook to use distributor context
 */
export function useDistributors() {
  const context = useContext(DistributorContext);
  if (!context) {
    throw new Error('useDistributors must be used within a DistributorProvider');
  }
  return context;
}

export default DistributorContext;
