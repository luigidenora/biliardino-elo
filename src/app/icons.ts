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
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  createIcons,
  Dices,
  Edit3,
  Fish,
  Gamepad2,
  Menu,
  MessageCircle,
  PlusCircle,
  RotateCcw,
  Search,
  Send,
  Shield,
  Star,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
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
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Dices,
  Edit3,
  Fish,
  Gamepad2,
  Menu,
  MessageCircle,
  PlusCircle,
  RotateCcw,
  Search,
  Send,
  Shield,
  Star,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
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
