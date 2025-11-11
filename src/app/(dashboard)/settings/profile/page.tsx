"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Lock, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Role {
  role: {
    id: string;
    name: string;
    description?: string;
  };
}

interface Client {
  client: {
    id: string;
    code: string;
    name: string;
  };
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  image?: string;
  isActive: boolean;
  createdAt: string;
  roles: Role[];
  clients: Client[];
}

export default function ProfilePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 프로필 정보
  const [name, setName] = useState("");
  const [image, setImage] = useState("");

  // 비밀번호 변경
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const fetchProfile = async () => {
    try {
      const response = await fetch("/api/profile");
      if (!response.ok) throw new Error("Failed to fetch profile");
      const data = await response.json();
      setProfile(data);
      setName(data.name);
      setImage(data.image || "");
    } catch (error) {
      toast({
        title: "오류",
        description: "프로필 정보를 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleUpdateProfile = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, image }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update profile");
      }

      toast({
        title: "성공",
        description: "프로필이 업데이트되었습니다.",
      });

      fetchProfile();
    } catch (error: any) {
      toast({
        title: "오류",
        description: error.message || "프로필 업데이트에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "오류",
        description: "새 비밀번호가 일치하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    setChangingPassword(true);
    try {
      const response = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to change password");
      }

      toast({
        title: "성공",
        description: "비밀번호가 변경되었습니다.",
      });

      // 비밀번호 필드 초기화
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({
        title: "오류",
        description: error.message || "비밀번호 변경에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">프로필을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const initials = profile.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || profile.email[0].toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">프로필 설정</h1>
          <p className="text-muted-foreground">
            개인 정보 및 보안 설정을 관리합니다.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* 프로필 카드 */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>프로필 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-4">
              <Avatar className="h-24 w-24">
                <AvatarImage src={profile.image || undefined} />
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
              <div className="text-center">
                <p className="text-lg font-semibold">{profile.name}</p>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
              </div>
              <Badge variant={profile.isActive ? "default" : "secondary"}>
                {profile.isActive ? "활성" : "비활성"}
              </Badge>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-2">역할</h3>
              <div className="flex flex-wrap gap-2">
                {profile.roles.length > 0 ? (
                  profile.roles.map((userRole) => (
                    <Badge key={userRole.role.id} variant="secondary">
                      {userRole.role.name}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">역할 없음</p>
                )}
              </div>
            </div>

            {profile.clients.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium mb-2">소속 고객사</h3>
                  <div className="space-y-1">
                    {profile.clients.map((userClient) => (
                      <div key={userClient.client.id} className="text-sm">
                        <span className="font-medium">{userClient.client.name}</span>
                        <span className="text-muted-foreground ml-2">
                          ({userClient.client.code})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            <div className="text-xs text-muted-foreground">
              <p>가입일: {new Date(profile.createdAt).toLocaleDateString("ko-KR")}</p>
            </div>
          </CardContent>
        </Card>

        {/* 설정 탭 */}
        <Card className="md:col-span-2">
          <Tabs defaultValue="profile" className="w-full">
            <CardHeader>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="profile">
                  <UserIcon className="h-4 w-4 mr-2" />
                  기본 정보
                </TabsTrigger>
                <TabsTrigger value="security">
                  <Lock className="h-4 w-4 mr-2" />
                  보안
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              <TabsContent value="profile" className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">이름</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="이름을 입력하세요"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">이메일</Label>
                    <Input
                      id="email"
                      value={profile.email}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      이메일은 변경할 수 없습니다.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="image">프로필 이미지 URL</Label>
                    <Input
                      id="image"
                      value={image}
                      onChange={(e) => setImage(e.target.value)}
                      placeholder="https://example.com/avatar.jpg"
                    />
                    <p className="text-xs text-muted-foreground">
                      프로필 이미지 URL을 입력하세요 (선택사항)
                    </p>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button onClick={handleUpdateProfile} disabled={saving}>
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? "저장 중..." : "저장"}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="security" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium mb-4">비밀번호 변경</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      보안을 위해 주기적으로 비밀번호를 변경하는 것을 권장합니다.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">현재 비밀번호</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="현재 비밀번호를 입력하세요"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">새 비밀번호</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="새 비밀번호를 입력하세요 (최소 6자)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="새 비밀번호를 다시 입력하세요"
                    />
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button
                      onClick={handleChangePassword}
                      disabled={
                        changingPassword ||
                        !currentPassword ||
                        !newPassword ||
                        !confirmPassword
                      }
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      {changingPassword ? "변경 중..." : "비밀번호 변경"}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
