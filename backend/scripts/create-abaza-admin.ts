import bcrypt from 'bcryptjs';
import { getConvexClient } from '../src/config/convex.js';
import { api } from '../../../convex/_generated/api.js';
import dotenv from 'dotenv';

dotenv.config();

async function createAbazaAdmin() {
  try {
    const convex = getConvexClient();
    
    // Check if user already exists
    const existingUser = await convex.query(api.users.getByEmail, { 
      email: 'abaza@mjd.com' 
    });
    
    if (existingUser) {
      console.log('User abaza@mjd.com already exists');
      
      // Update the password
      const hashedPassword = await bcrypt.hash('abaza123', 10);
      
      await convex.mutation(api.users.updatePassword, {
        userId: existingUser._id,
        password: hashedPassword
      });
      
      console.log('Password updated successfully for abaza@mjd.com');
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash('abaza123', 10);
      
      const userId = await convex.mutation(api.users.create, {
        email: 'abaza@mjd.com',
        password: hashedPassword,
        name: 'Abaza Admin',
        role: 'admin',
        isApproved: true,
      });
      
      console.log('Admin user created successfully!');
      console.log('Email: abaza@mjd.com');
      console.log('Password: abaza123');
      console.log('User ID:', userId);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAbazaAdmin();