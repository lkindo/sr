/**
 * SR 접수 정보 입력 폼 카드 컴포넌트
 */

import { UseFormReturn } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { AlertCircle, CalendarIcon, CheckCircle, Clock, User } from 'lucide-react';

import { Button } from '@/components/ui';
import { Calendar } from '@/components/ui';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui';
import { Input } from '@/components/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { Textarea } from '@/components/ui';
import { priorityLabels } from '@/lib/constants/sr';
import { cn } from '@/lib/utils';
import type { SRDetails } from '@/types/sr.types';

import type { IntakeFormValues } from './useIntakeForm';

interface UserType {
  id: string;
  name: string;
  email: string;
}

interface IntakeFormCardProps {
  form: UseFormReturn<IntakeFormValues>;
  onSubmit: (values: IntakeFormValues) => Promise<void>;
  sr: SRDetails;
  users: UserType[];
  isEditMode: boolean;
  submitting: boolean;
}

export function IntakeFormCard({
  form,
  onSubmit,
  sr,
  users,
  isEditMode,
  submitting,
}: IntakeFormCardProps) {
  const router = useRouter();

  return (
    <div className="sr-card-template bg-white">
      {/* 카드 헤더 */}
      <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[hsl(var(--sr-primary-dark))] text-white font-bold text-sm">
            2
          </div>
          <div>
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">
              접수 정보 입력
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              실제 우선순위, 예상 작업시간, 담당자 등을 결정하세요
            </p>
          </div>
        </div>
      </div>

      {/* 카드 내용 */}
      <div className="px-6 py-5">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* 실제 우선순위 */}
            <FormField
              control={form.control}
              name="actualPriority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>실제 우선순위 *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="우선순위를 선택하세요" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="CRITICAL">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-600" />
                          긴급 (CRITICAL)
                        </div>
                      </SelectItem>
                      <SelectItem value="HIGH">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-orange-600" />
                          높음 (HIGH)
                        </div>
                      </SelectItem>
                      <SelectItem value="MEDIUM">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-blue-600" />
                          보통 (MEDIUM)
                        </div>
                      </SelectItem>
                      <SelectItem value="LOW">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-gray-600" />
                          낮음 (LOW)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    요청자의 희망 우선순위: {priorityLabels[sr.requestedPriority]}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 예상 작업 시간 */}
            <FormField
              control={form.control}
              name="estimatedHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>예상 작업 시간 (시간) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.5"
                      placeholder="예: 8"
                      className="sr-input-template"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>SLA 기준: {sr.serviceCategory.slaHours}시간</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 예상 완료일 */}
            <FormField
              control={form.control}
              name="estimatedCompletionDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>예상 완료일 *</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? (
                            format(field.value, 'PPP', { locale: ko })
                          ) : (
                            <span>날짜를 선택하세요</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    {sr.requestedCompletionDate && (
                      <>
                        요청자 희망일:{' '}
                        {format(new Date(sr.requestedCompletionDate), 'PPP', {
                          locale: ko,
                        })}
                      </>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 담당자 선택 */}
            <FormField
              control={form.control}
              name="assigneeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>담당자 *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="담당자를 선택하세요" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {users.length === 0 ? (
                        <SelectItem value="" disabled>
                          담당자 목록을 불러오는 중...
                        </SelectItem>
                      ) : (
                        users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {user.name} ({user.email})
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {sr.serviceCategory.handler && (
                      <>추천 담당자: {sr.serviceCategory.handler.name}</>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 접수 메모 */}
            <FormField
              control={form.control}
              name="intakeNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>접수 메모 (선택)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="SR에 대한 분석 내용이나 특이사항을 기록하세요"
                      className="min-h-[100px] sr-input-template"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>SR 처리에 도움이 될 정보를 기록하세요</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 제출 버튼 */}
            <div className="flex gap-4">
              <Button
                type="button"
                onClick={() => router.push('/srs')}
                className="flex-1 sr-btn-template"
                disabled={submitting}
              >
                취소
              </Button>
              <Button
                type="submit"
                className="flex-1 sr-btn-template-primary"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                    {isEditMode ? '수정 중...' : '접수 처리 중...'}
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    {isEditMode ? '저장' : '저장'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
