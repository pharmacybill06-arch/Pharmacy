import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import { Colors } from '../../constants/theme';
import { productApi } from '../../services/api';

/**
 * ProductSearchDropdown
 * Typeahead search for products with stock validation
 */
const ProductSearchDropdown = ({
  userId,
  onProductSelect,
  placeholder = 'Search product...',
  excludeProductIds = []
}) => {
  // Fix: define colors from Colors.light
  const colors = Colors.light;
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeout = useRef(null);

  // Debounced search
  const performSearch = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const data = await productApi.searchProducts(userId, query, 10);

      // Filter out excluded products and out-of-stock
      const filtered = (data.products || []).filter(
        p => !excludeProductIds.includes(p.id) && p.stock > 0
      );

      setSuggestions(filtered);
    } catch (error) {
      console.error('Product search error:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [userId, excludeProductIds]);

  const handleSearch = useCallback((text) => {
    setSearchQuery(text);
    setShowDropdown(true);

    // Clear existing timeout
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    // Debounce search
    searchTimeout.current = setTimeout(() => {
      performSearch(text);
    }, 300);
  }, [performSearch]);

  const handleProductSelect = (product) => {
    if (product.stock <= 0) {
      Alert.alert('Out of Stock', `${product.name} is currently out of stock`);
      return;
    }

    onProductSelect({
      productId: product.id,
      name: product.name,
      manufacturer: product.manufacturer,
      hsnCode: product.hsnCode,
      unit: product.unit || 'units',
      mrp: product.mrp,
      sellingRate: product.sellingRate,
      purchaseRate: product.purchaseRate,
      stock: product.stock,
      minStock: product.minStock
    });

    // Clear search
    setSearchQuery('');
    setSuggestions([]);
    setShowDropdown(false);
  };

  useEffect(() => {
    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          value={searchQuery}
          onChangeText={handleSearch}
          onFocus={() => setShowDropdown(true)}
          placeholderTextColor={Colors.light.gray}
        />
        {loading && <ActivityIndicator color={Colors.light.primary} />}
      </View>

      {showDropdown && suggestions.length > 0 && (
        <View style={styles.dropdown}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestion}
                onPress={() => handleProductSelect(item)}
              >
                <View style={styles.suggestionContent}>
                  <Text style={styles.productName}>{item.name}</Text>
                  {item.manufacturer && (
                    <Text style={styles.manufacturer}>{item.manufacturer}</Text>
                  )}
                  <View style={styles.priceStock}>
                    <Text style={styles.price}>₹{item.sellingRate || 'N/A'}</Text>
                    <Text
                      style={[
                        styles.stock,
                        item.stock < (item.minStock || 5)
                          ? styles.lowStock
                          : styles.goodStock
                      ]}
                    >
                      Stock: {item.stock}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {showDropdown && searchQuery && suggestions.length === 0 && !loading && (
        <View style={styles.noResults}>
          <Text style={styles.noResultsText}>No products found</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 10
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.gray,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.light.white
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
    padding: 0
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: Colors.light.white,
    borderWidth: 1,
    borderColor: Colors.light.gray,
    borderRadius: 8,
    maxHeight: 250,
    zIndex: 20
  },
  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.lightGray
  },
  suggestionContent: {
    gap: 4
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text
  },
  manufacturer: {
    fontSize: 12,
    color: Colors.light.gray
  },
  priceStock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4
  },
  price: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.primary
  },
  stock: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  goodStock: {
    backgroundColor: Colors.light.success + '20',
    color: Colors.light.success
  },
  lowStock: {
    backgroundColor: Colors.light.warning + '20',
    color: Colors.light.warning
  },
  noResults: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: Colors.light.white,
    borderWidth: 1,
    borderColor: Colors.light.gray,
    borderRadius: 8,
    paddingVertical: 20,
    zIndex: 20
  },
  noResultsText: {
    textAlign: 'center',
    color: Colors.light.gray,
    fontSize: 12
  }
});

export default ProductSearchDropdown;
