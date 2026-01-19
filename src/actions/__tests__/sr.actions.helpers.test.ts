import { describe, expect, it } from 'vitest';

import { buildSRCreateInput, buildSRUpdateInput } from '../sr-form.utils';

describe('sr.actions helpers', () => {
  it('buildSRCreateInput는 FormData의 모든 필드를 추출한다', () => {
    const formData = new FormData();
    formData.set('title', 'New');
    formData.set('description', 'Desc');
    formData.set('clientId', 'client-1');
    formData.set('serviceCategoryId', 'sc-1');

    const result = buildSRCreateInput(formData);

    expect(result.title).toBe('New');
    expect(result.description).toBe('Desc');
    expect(result.clientId).toBe('client-1');
    expect(result.serviceCategoryId).toBe('sc-1');
  });

  it('buildSRUpdateInput는 빈 값과 특수 필드를 포함한 모든 데이터를 추출한다', () => {
    const formData = new FormData();
    formData.set('title', '');
    formData.set('satisfactionRating', '5');
    formData.set('estimatedHours', '2.5');
    formData.set('status', '');

    const processed = buildSRUpdateInput(formData);

    expect(processed.title).toBe('');
    expect(processed.satisfactionRating).toBe('5');
    expect(processed.estimatedHours).toBe('2.5');
    expect(processed.status).toBe('');
  });
});
