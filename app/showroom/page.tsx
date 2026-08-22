"use client";

import { LuxeHomePage } from "../../components/homeluxe";

/**
 * The house.
 *
 * It used to be `/`, which meant a visitor arrived INSIDE a 3D building with
 * no idea what they were looking at or who was behind it. The company's page
 * is the front door now and this is the room behind it.
 *
 * Everything that links here says "the house" or "the showroom" -- the
 * notification emails included, which is why moving it needed a migration
 * rather than only a file rename. See 0020.
 */
export default function ShowroomPage() {
  return <LuxeHomePage />;
}
