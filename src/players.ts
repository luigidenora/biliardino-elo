import { MatchService } from './services/match.service';
import { PlayerService } from './services/player.service';
import { RepositoryService } from './services/repository.service';
import { PlayersView } from './views/players.view';

MatchService.loadMatches(await RepositoryService.loadMatches());
PlayerService.loadPlayers(await RepositoryService.loadPlayers());

PlayersView.init();
