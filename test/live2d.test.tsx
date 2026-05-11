/** @vitest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import Character from '../components/Character';

describe('Character', () => {
  it('renders loaded status text', () => {
    render(<Character />);
    expect(screen.getByText(/Live2D 看板娘 已加载/)).toBeTruthy();
    expect(screen.getByText(/旧的聊天\/养成\/提醒模块已全部移除/)).toBeTruthy();
  });
});

