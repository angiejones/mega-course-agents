import { z } from 'zod';

const customerMessage = z.string().trim().min(1).max(8000);

export function validateMessage(message: string): void {
  customerMessage.parse(message);
}
