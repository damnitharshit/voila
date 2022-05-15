autoload -U compinit
compinit

# Colors
autoload -U colors && colors

# History
HISTFILE=~/.zsh_history
HISTSIZE=1000
SAVEHIST=1000

# Prompt
PS1="% %F{3}▇%f %~ ❭ %"

# Aliases
alias ls='exa --color=auto --group-directories-first'
alias c='clear'
alias x="exit"
alias cat='bat'
alias yay="sudo pacman -S"
alias yo="pacman -Ss"
alias yeet="sudo pacman -Rns"
alias camera="mpv av://v4l2:/dev/video0 --profile=low-latency --untimed"

source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
