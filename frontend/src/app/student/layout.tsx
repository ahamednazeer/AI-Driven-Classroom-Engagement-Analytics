import DashboardLayout from "@/components/DashboardLayout";

export default function StudentLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return <DashboardLayout>{children}</DashboardLayout>;
}
