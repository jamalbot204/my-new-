
import { useState, useEffect, useCallback } from 'react';
import { ApiKey } from '../types';
import * as dbService from '../services/dbService';
import { METADATA_KEYS } from '../services/dbService';

export function useApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadKeys = async () => {
      setIsLoading(true);
      try {
        const storedKeys = await dbService.getAppMetadata<ApiKey[]>(METADATA_KEYS.API_KEYS);
        setApiKeys(storedKeys || []);
      } catch (error) {
        console.error("Failed to load API keys from storage:", error);
        setApiKeys([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadKeys();
  }, []);

  const persistKeys = useCallback(async (keys: ApiKey[]) => {
    try {
      await dbService.setAppMetadata(METADATA_KEYS.API_KEYS, keys);
    } catch (error) {
      console.error("Failed to save API keys:", error);
    }
  }, []);

  const addApiKey = useCallback(() => {
    const newKey: ApiKey = {
      id: `apikey-${Date.now()}`,
      name: `Key ${apiKeys.length + 1}`,
      value: '',
    };
    const newKeys = [...apiKeys, newKey];
    setApiKeys(newKeys);
    persistKeys(newKeys);
  }, [apiKeys, persistKeys]);

  const updateApiKey = useCallback((id: string, name: string, value: string) => {
    const newKeys = apiKeys.map(key =>
      key.id === id ? { ...key, name, value } : key
    );
    setApiKeys(newKeys);
    persistKeys(newKeys);
  }, [apiKeys, persistKeys]);

  const deleteApiKey = useCallback((id: string) => {
    const newKeys = apiKeys.filter(key => key.id !== id);
    setApiKeys(newKeys);
    persistKeys(newKeys);
  }, [apiKeys, persistKeys]);

  const reorderApiKeys = useCallback((newOrder: ApiKey[]) => {
    setApiKeys(newOrder);
    persistKeys(newOrder);
  }, [persistKeys]);
  
  const rotateKeys = useCallback(() => {
    if (apiKeys.length > 1) {
      const rotatedKeys = [...apiKeys.slice(1), apiKeys[0]];
      setApiKeys(rotatedKeys);
      persistKeys(rotatedKeys);
    }
  }, [apiKeys, persistKeys]);

  const toggleKeyVisibility = useCallback(() => {
    setIsKeyVisible(prev => !prev);
  }, []);
  
  const activeApiKey = apiKeys.length > 0 ? apiKeys[0] : null;

  return {
    apiKeys,
    activeApiKey,
    isKeyVisible,
    isLoading,
    addApiKey,
    updateApiKey,
    deleteApiKey,
    reorderApiKeys,
    toggleKeyVisibility,
    rotateKeys,
  };
}
