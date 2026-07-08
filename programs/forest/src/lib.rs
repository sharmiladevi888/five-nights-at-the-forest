use anchor_lang::prelude::*;

declare_id!("Fore5tGameProgram11111111111111111111111111");

// On-chain score registry + admin-gated airdrop record.
// The airdrop instruction is gated so ONLY the admin set at init can call it.
#[program]
pub mod forest {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.total_scores = 0;
        Ok(())
    }

    // Store / update a player's verified high score on-chain.
    pub fn submit_score(ctx: Context<SubmitScore>, score: u64, nights: u8) -> Result<()> {
        let entry = &mut ctx.accounts.score_entry;
        if score > entry.high_score {
            entry.high_score = score;
            entry.nights_cleared = nights;
        }
        entry.player = ctx.accounts.player.key();
        let config = &mut ctx.accounts.config;
        config.total_scores = config.total_scores.saturating_add(1);
        Ok(())
    }

    // Record an airdrop. Admin-gated via the has_one constraint below.
    pub fn record_airdrop(ctx: Context<RecordAirdrop>, amount: u64) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.admin.key(),
            ctx.accounts.config.admin,
            ForestError::Unauthorized
        );
        let rec = &mut ctx.accounts.airdrop_record;
        rec.recipient = ctx.accounts.recipient.key();
        rec.amount = amount;
        rec.timestamp = Clock::get()?.unix_timestamp;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 8)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitScore<'info> {
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + 32 + 8 + 1,
        seeds = [b"score", player.key().as_ref()],
        bump
    )]
    pub score_entry: Account<'info, ScoreEntry>,
    #[account(mut)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordAirdrop<'info> {
    #[account(has_one = admin)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 8 + 8,
        seeds = [b"airdrop", recipient.key().as_ref()],
        bump
    )]
    pub airdrop_record: Account<'info, AirdropRecord>,
    /// CHECK: recipient is only stored, not read
    pub recipient: UncheckedAccount<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub total_scores: u64,
}

#[account]
pub struct ScoreEntry {
    pub player: Pubkey,
    pub high_score: u64,
    pub nights_cleared: u8,
}

#[account]
pub struct AirdropRecord {
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum ForestError {
    #[msg("Only the admin may perform this action.")]
    Unauthorized,
}
