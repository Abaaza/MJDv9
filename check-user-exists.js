import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';

const CONVEX_URL = 'https://trustworthy-badger-677.convex.cloud';

async function checkUser() {
  try {
    const convex = new ConvexHttpClient(CONVEX_URL);
    
    // Get all users
    const users = await convex.query(api.users.getAllUsers);
    console.log('All users:');
    users.forEach(u => {
      console.log(`  ${u._id} - ${u.email} (${u.name})`);
    });
    
    // Check for abaza user
    const abazaUser = users.find(u => u.email === 'abaza@mjd.com');
    if (abazaUser) {
      console.log('\nAbaza user found:');
      console.log('  ID:', abazaUser._id);
      console.log('  Name:', abazaUser.name);
      console.log('  Email:', abazaUser.email);
      console.log('  Role:', abazaUser.role);
    } else {
      console.log('\nAbaza user NOT found!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkUser();