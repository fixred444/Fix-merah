import { adminCrud } from '@/lib/server';
export const { GET, POST, PUT, DELETE } = adminCrud('targets', ['label', 'email', 'active']);
