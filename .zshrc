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
alias t="nvim lists/t.md"
alias m="nvim lists/m.md"
alias lofi="mpv 'https://www.youtube.com/watch?v=jfKfPfyJRdk' --no-resume-playback"
alias ts="nvim lists/tostudy.md"
alias am="echo '$a' >> lists/m.md"
alias ytmdl="~/.local/bin/ytmdl --format opus" 
alias syu="sudo pacman -Syu"

source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
