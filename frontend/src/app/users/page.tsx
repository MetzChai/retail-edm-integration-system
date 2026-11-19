"use client";
import React from "react";
import { useAuth } from "@/lib/auth-context";
import { UserManagement } from "@/components/user-management";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function UsersPage() {
  const { user } = useAuth();
  const isAdmin = String(user?.role || "").toLowerCase() === "admin";

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="pt-6 text-center">
            <ShieldAlert className="mx-auto text-red-600 mb-3" size={40} />
            <h2 className="text-lg font-bold text-red-900">Access Restricted</h2>
            <p className="text-sm text-red-700 mt-1">
              Only Administrator accounts have permission to view and manage user registrations, approvals, and roles.
            </p>
            <div className="mt-4">
              <Link href="/">
                <Button variant="outline" className="text-sm">
                  Return to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UserManagement />
    </div>
  );
}
