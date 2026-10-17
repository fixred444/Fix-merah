import { adminCrud } from '@/lib/server';
export const { GET, POST, PUT, DELETE } = adminCrud('templates', ['title', 'subject', 'body']);
