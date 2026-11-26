import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './auth';
import { EventsList } from './events-list';

export const routes: Routes = [
  { path: '', component: EventsList, canActivate: [authGuard], title: 'My Events · Om-Magnet' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./login').then((m) => m.Login),
    title: 'Sign in · Om-Magnet'
  },
  {
    path: 'events/new',
    canActivate: [authGuard],
    loadComponent: () => import('./new-event').then((m) => m.NewEvent),
    title: 'New Event · Om-Magnet'
  },
  {
    path: 'events/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./editor').then((m) => m.Editor),
    title: 'Event · Om-Magnet'
  },
  {
    path: 'admin/users',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./admin-users').then((m) => m.AdminUsers),
    title: 'Users · Om-Magnet'
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./account').then((m) => m.Account),
    title: 'My account · Om-Magnet'
  },
  { path: '**', redirectTo: '' }
];
