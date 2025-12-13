import { MatchService } from './services/match.service';
import { PlayerService } from './services/player.service';
import { RepositoryService } from './services/repository.service';
import { updateElo } from './utils/update-elo.util';
import { MatchmakingView } from './views/matchmaking.view';

// Load data
MatchService.loadMatches(await RepositoryService.loadMatches());
PlayerService.loadPlayers(await RepositoryService.loadPlayers());

// Update ELO for all matches
MatchService.getAllMatches().forEach(m => updateElo(m));

// Initialize the matchmaking view
MatchmakingView.init();
