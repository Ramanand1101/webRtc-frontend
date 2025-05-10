import { Suspense } from 'react';
import RoomPageClient from '../../room/RoomPageClient';

export default function RoomPage() {
  return (
    <Suspense fallback={<div>Loading Room...</div>}>
      <RoomPageClient />
    </Suspense>
  );
}