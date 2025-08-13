import React, { useEffect, useState } from 'react';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const DebugClientPriceLists = () => {
  const convex = useConvex();
  const [clients, setClients] = useState<any[]>([]);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all clients
      const allClients = await convex.query(api.clients.getAll);
      setClients(allClients || []);
      
      // Fetch all active price lists
      const allPriceLists = await convex.query(api.clientPriceLists.getAllActive);
      setPriceLists(allPriceLists || []);
      
      console.log('Clients:', allClients);
      console.log('Price Lists:', allPriceLists);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const createSamplePriceList = async () => {
    try {
      // Find or create a test client
      let testClient = clients.find(c => c.name === 'Abaza Co.' || c.name === 'Test Client');
      
      if (!testClient && clients.length > 0) {
        testClient = clients[0]; // Use first available client
      }
      
      if (!testClient) {
        alert('No clients found. Please create a client first.');
        return;
      }

      // Get the current user (we'll use the first user for testing)
      const users = await convex.query(api.users.getAllUsers);
      const user = users[0];
      
      if (!user) {
        alert('No users found. Please login first.');
        return;
      }

      // Create a sample price list
      const priceListId = await convex.mutation(api.clientPriceLists.create, {
        clientId: testClient._id,
        name: `${testClient.name} Test Price List`,
        description: 'Test price list created for debugging',
        isDefault: true,
        isActive: true,
        effectiveFrom: Date.now(),
        effectiveTo: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
        sourceFileName: 'test-file.xlsx',
        userId: user._id,
      });

      console.log('Created price list:', priceListId);
      alert(`Price list created with ID: ${priceListId}`);
      
      // Refresh data
      await fetchData();
    } catch (err: any) {
      console.error('Error creating price list:', err);
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) return <div className="p-4">Loading debug info...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

  return (
    <Card className="p-4 m-4">
      <h2 className="text-lg font-bold mb-4">Debug: Client Price Lists</h2>
      
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold">Clients ({clients.length}):</h3>
          {clients.length === 0 ? (
            <p className="text-gray-500">No clients found</p>
          ) : (
            <ul className="list-disc list-inside">
              {clients.map(client => (
                <li key={client._id}>
                  {client.name} (ID: {client._id}, Active: {client.isActive ? 'Yes' : 'No'})
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="font-semibold">Active Price Lists ({priceLists.length}):</h3>
          {priceLists.length === 0 ? (
            <p className="text-gray-500">No active price lists found</p>
          ) : (
            <ul className="list-disc list-inside">
              {priceLists.map(pl => (
                <li key={pl._id}>
                  {pl.name} - Client: {pl.clientName} (Default: {pl.isDefault ? 'Yes' : 'No'}, Active: {pl.isActive ? 'Yes' : 'No'})
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline">
            Refresh Data
          </Button>
          <Button onClick={createSamplePriceList} variant="default">
            Create Sample Price List
          </Button>
        </div>

        <div className="text-xs text-gray-500 mt-4">
          <p>Check browser console for detailed logs</p>
          <p>This debug component directly queries Convex to show what's in the database</p>
        </div>
      </div>
    </Card>
  );
};