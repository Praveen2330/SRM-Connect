// Using modern JSX transform - no React import needed
import { User } from 'lucide-react';

interface ProfilePictureProps {
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'w-10 h-10',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-32 h-32'
};

const iconSizes = {
  sm: 20,
  md: 24,
  lg: 32,
  xl: 48
};

export default function ProfilePicture({
  avatarUrl = null,
  size = 'md',
  className = ''
}: ProfilePictureProps) {
  return (
    <div className={`${sizeClasses[size]} rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center ${className}`}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt="Profile"
          className="w-full h-full object-cover"
        />
      ) : (
        <User size={iconSizes[size]} className="text-gray-400" />
      )}
    </div>
  );
} 