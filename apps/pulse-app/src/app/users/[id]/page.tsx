import UserProfilePageClient from "./UserProfilePageClient";

export function generateStaticParams() {
  return [{ id: "mobile" }];
}

export default function UserProfilePage() {
  return <UserProfilePageClient />;
}
