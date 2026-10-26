import ThemedJukeboxWrapper from '@/components/ThemedJukeboxWrapper';
import TriviaGame from '@/components/trivia/TriviaGame';

export default function TriviaPage() {
  return (
    <ThemedJukeboxWrapper>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="sp-panel w-full max-w-md">
          <TriviaGame />
        </div>
      </div>
    </ThemedJukeboxWrapper>
  );
}
