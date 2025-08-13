import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

export const SimplePriceListDebug = () => {
  // Fetch clients
  const clients = useQuery(api.clients.getAll);
  const activeClients = useQuery(api.clients.getActive);
  
  // Fetch price lists
  const allPriceLists = useQuery(api.clientPriceLists.getAllActive);
  
  // Simple refresh - just reload the page
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <Card className="p-4 m-4 bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-blue-500" />
          Debug Panel - Price Lists Status
        </h2>
        <Button onClick={handleRefresh} size="sm" variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      <div className="grid md:grid-cols-3 gap-4">
        {/* Clients Status */}
        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
          <h3 className="font-semibold text-sm mb-2">All Clients</h3>
          {clients === undefined ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : clients === null ? (
            <p className="text-red-500 text-sm">Error loading clients</p>
          ) : (
            <div>
              <p className="text-2xl font-bold">{clients.length}</p>
              <p className="text-xs text-gray-500">Total clients in database</p>
              {clients.length > 0 && (
                <div className="mt-2 max-h-20 overflow-y-auto">
                  {clients.slice(0, 3).map(c => (
                    <div key={c._id} className="text-xs text-gray-600">
                      • {c.name}
                    </div>
                  ))}
                  {clients.length > 3 && (
                    <div className="text-xs text-gray-400">
                      +{clients.length - 3} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Active Clients Status */}
        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
          <h3 className="font-semibold text-sm mb-2">Active Clients</h3>
          {activeClients === undefined ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : activeClients === null ? (
            <p className="text-red-500 text-sm">Error loading</p>
          ) : (
            <div>
              <p className="text-2xl font-bold text-green-600">{activeClients.length}</p>
              <p className="text-xs text-gray-500">Active clients</p>
            </div>
          )}
        </div>

        {/* Price Lists Status */}
        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
          <h3 className="font-semibold text-sm mb-2">Active Price Lists</h3>
          {allPriceLists === undefined ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : allPriceLists === null ? (
            <p className="text-red-500 text-sm">Error loading price lists</p>
          ) : (
            <div>
              <p className="text-2xl font-bold text-blue-600">{allPriceLists.length}</p>
              <p className="text-xs text-gray-500">Active price lists</p>
              {allPriceLists.length > 0 && (
                <div className="mt-2 max-h-20 overflow-y-auto">
                  {allPriceLists.slice(0, 3).map((pl: any) => (
                    <div key={pl._id} className="text-xs text-gray-600">
                      • {pl.name} ({pl.clientName})
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status Messages */}
      <div className="mt-4 text-xs text-gray-600">
        {allPriceLists?.length === 0 && clients?.length === 0 && (
          <div className="flex items-center gap-2 text-yellow-600">
            <AlertCircle className="h-4 w-4" />
            No clients or price lists found. You need to create clients first.
          </div>
        )}
        {allPriceLists?.length === 0 && clients?.length > 0 && (
          <div className="flex items-center gap-2 text-blue-600">
            <AlertCircle className="h-4 w-4" />
            Clients exist but no price lists. Use "Client Prices" to create one.
          </div>
        )}
        {allPriceLists?.length > 0 && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" />
            Price lists found! They should appear in the Client Prices modal.
          </div>
        )}
      </div>

      {/* Console Log Button */}
      <div className="mt-4 pt-4 border-t">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            console.log('=== Debug Data ===');
            console.log('All Clients:', clients);
            console.log('Active Clients:', activeClients);
            console.log('All Price Lists:', allPriceLists);
            alert('Check browser console (F12) for detailed data');
          }}
        >
          Log Data to Console
        </Button>
      </div>
    </Card>
  );
};