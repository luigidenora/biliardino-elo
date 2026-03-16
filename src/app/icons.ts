/**
 * Centralized Lucide icon registry.
 *
 * All icons used across the SPA are imported here so that a single
 * `refreshIcons()` call replaces every `<i data-lucide="...">` in the DOM
 * without "icon not found" warnings.
 */

import {
  Activity,
  Award,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleUser,
  Clock,
  createIcons,
  Dices,
  Edit3,
  Fish,
  Gamepad2,
  History,
  Medal,
  Menu,
  MessageCircle,
  PlusCircle,
  RotateCcw,
  ScrollText,
  Search,
  Send,
  Shield,
  Star,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  User,
  UserCheck,
  UserCircle,
  UserPlus,
  Users,
  Wifi,
  X,
  Zap
} from 'lucide';

const APP_ICONS = {
  Activity,
  Award,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleUser,
  Clock,
  Dices,
  Edit3,
  Fish,
  Gamepad2,
  History,
  Medal,
  Menu,
  MessageCircle,
  PlusCircle,
  RotateCcw,
  ScrollText,
  Search,
  Send,
  Shield,
  Star,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  User,
  UserCheck,
  UserCircle,
  UserPlus,
  Users,
  Wifi,
  X,
  Zap
};

/** Replace all `<i data-lucide="...">` in the DOM with their SVG icons. */
export function refreshIcons(): void {
  createIcons({ icons: APP_ICONS });
}
