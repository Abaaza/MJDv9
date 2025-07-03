import bcrypt from 'bcryptjs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';
import dotenv from 'dotenv';

dotenv.config();

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

async function setupAdmin() {
  try {
    // Check if admin already exists
    const existingAdmin = await convex.query(api.users.getByEmail, { 
      email: 'admin@boqsystem.com' 
    });
    
    if (existingAdmin) {
      console.log('Admin user already exists!');
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // Create admin user
    const userId = await convex.mutation(api.users.create, {
      email: 'admin@boqsystem.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'admin',
      isApproved: true
    });
    
    console.log('Admin user created successfully!');
    console.log('Email: admin@boqsystem.com');
    console.log('Password: admin123');
    console.log('User ID:', userId);
    
  } catch (error) {
    console.error('Error setting up admin:', error);
  }
}

setupAdmin();